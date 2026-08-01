import { cert, getApps, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import {
  getMessaging,
  type BatchResponse,
  type FidMulticastMessage,
  type MulticastMessage,
} from 'firebase-admin/messaging';
import { ObjectId, type Db, type Document } from 'mongodb';
import logger from '../config/logger.js';
import type { PushDevice, PushTargetKind } from '../types/push.js';
import { dateToIso } from '../utils/timezone.js';
import { buildReminderPushNotificationTag } from '../utils/pushNotificationTag.js';

const DEAD_TARGET_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/installation-id-not-registered',
]);
const TRANSIENT_CODES = new Set([
  'messaging/server-unavailable',
  'messaging/internal-error',
]);
const DEFAULT_CHANNEL = 'default';

let firebaseApp: App | null = null;

function firebaseErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  return typeof error.code === 'string' ? error.code : null;
}

function getFirebaseApp(): App {
  if (firebaseApp) return firebaseApp;
  const existing = getApps()[0];
  if (existing) {
    firebaseApp = existing;
    return existing;
  }
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (!encoded) throw new Error('FIREBASE_SERVICE_ACCOUNT_B64 is not configured');
  const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8')) as ServiceAccount;
  firebaseApp = initializeApp({ credential: cert(serviceAccount) });
  return firebaseApp;
}

export async function validateFcmCredentials(): Promise<void> {
  try {
    await getMessaging(getFirebaseApp()).send(
      { token: 'fake-token-for-auth-validation' },
      true,
    );
    throw new Error('FCM unexpectedly accepted the validation target');
  } catch (error) {
    const code = firebaseErrorCode(error);
    if (
      code === 'messaging/invalid-argument'
      || code === 'messaging/registration-token-not-registered'
    ) return;
    throw error;
  }
}

function trimUtf8(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  let result = '';
  for (const character of value) {
    if (Buffer.byteLength(result + character, 'utf8') > maxBytes - 3) break;
    result += character;
  }
  return `${result}...`;
}

function waitForRetry(): Promise<void> {
  const delayMs = 150 + Math.floor(Math.random() * 351);
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildMessage(
  targetKind: PushTargetKind,
  devices: PushDevice[],
  notification: { title: string; body: string },
  data: Record<string, string>,
  ttlMs: number,
  tag: string,
): FidMulticastMessage | MulticastMessage {
  const base = {
    notification,
    data,
    android: {
      ttl: ttlMs,
      priority: 'high' as const,
      notification: {
        tag,
        channelId: DEFAULT_CHANNEL,
      },
    },
    webpush: {
      headers: { TTL: String(Math.ceil(ttlMs / 1000)) },
      notification: { tag },
      fcmOptions: data.link ? { link: data.link } : undefined,
    },
  };
  const targetIds = devices.map((device) => device.targetId);
  return targetKind === 'fid' ? { ...base, fids: targetIds } : { ...base, tokens: targetIds };
}

async function dispatchBatch(
  targetKind: PushTargetKind,
  devices: PushDevice[],
  notification: { title: string; body: string },
  data: Record<string, string>,
  ttlMs: number,
  tag: string,
): Promise<BatchResponse> {
  const messaging = getMessaging(getFirebaseApp());
  const message = buildMessage(targetKind, devices, notification, data, ttlMs, tag);
  return targetKind === 'fid'
    ? messaging.sendEachForMulticast(message as FidMulticastMessage)
    : messaging.sendEachForMulticast(message as MulticastMessage);
}

async function persistDeliveryResults(
  database: Db,
  devices: PushDevice[],
  result: BatchResponse,
): Promise<void> {
  await Promise.all(result.responses.map(async (response, index) => {
    const device = devices[index];
    if (!device?._id) return;
    if (response.success) {
      // Do not touch lastSeenAt on delivery: only the app's own check-ins
      // (register/reconcile/mode change) mean "this device is alive". Stamping
      // it here would set every push device of a user to the same instant on
      // each tick, hiding which device is real and defeating the
      // lastSeenAt-based eviction in pushDeviceService.registerPushDevice.
      await database.collection<Document>('push_devices').updateOne(
        { _id: device._id } as Document,
        { $set: { failCount: 0 } },
      );
      return;
    }
    const code = firebaseErrorCode(response.error);
    if (code && DEAD_TARGET_CODES.has(code)) {
      await database.collection<Document>('push_devices').deleteOne({ _id: device._id } as Document);
      logger.info({ deviceId: device.deviceId, code }, 'Removed dead push target');
      return;
    }
    await database.collection<Document>('push_devices').updateOne(
      { _id: device._id } as Document,
      { $inc: { failCount: 1 } },
    );
    logger.warn({ deviceId: device.deviceId, code }, 'Push target delivery failed');
  }));
}

async function sendToTargetKind(
  database: Db,
  targetKind: PushTargetKind,
  devices: PushDevice[],
  notification: { title: string; body: string },
  data: Record<string, string>,
  graceDeadline: Date,
  tag: string,
): Promise<number> {
  if (!devices.length) return 0;
  let ttlMs = graceDeadline.getTime() - Date.now();
  if (ttlMs <= 0) return 0;
  let result: BatchResponse;
  try {
    result = await dispatchBatch(targetKind, devices, notification, data, ttlMs, tag);
  } catch (error) {
    if (!TRANSIENT_CODES.has(firebaseErrorCode(error) ?? '')) throw error;
    await waitForRetry();
    ttlMs = graceDeadline.getTime() - Date.now();
    if (ttlMs <= 0) return 0;
    result = await dispatchBatch(targetKind, devices, notification, data, ttlMs, tag);
  }

  const retryDevices = result.responses
    .map((response, index) => ({ response, device: devices[index] }))
    .filter(({ response }) => !response.success && TRANSIENT_CODES.has(firebaseErrorCode(response.error) ?? ''))
    .map(({ device }) => device);

  const settledDevices: PushDevice[] = [];
  const settledResponses = result.responses.filter((response, index) => {
    const transient = !response.success && TRANSIENT_CODES.has(firebaseErrorCode(response.error) ?? '');
    if (!transient) settledDevices.push(devices[index]);
    return !transient;
  });

  await persistDeliveryResults(
    database,
    settledDevices,
    { responses: settledResponses, successCount: 0, failureCount: 0 },
  );

  if (retryDevices.length) {
    await waitForRetry();
    ttlMs = graceDeadline.getTime() - Date.now();
    if (ttlMs <= 0) return result.successCount;
    const retryResult = await dispatchBatch(
      targetKind,
      retryDevices,
      notification,
      data,
      ttlMs,
      tag,
    );
    await persistDeliveryResults(database, retryDevices, retryResult);
    return result.successCount + retryResult.successCount;
  }
  return result.successCount;
}

function toOwnerObjectId(userId: unknown): ObjectId {
  if (userId instanceof ObjectId) return userId;
  return ObjectId.createFromHexString(String(userId));
}

export async function sendTaskReminderPush(
  database: Db,
  task: Document,
  occurrenceAt: Date,
  graceDeadline: Date,
): Promise<void> {
  if (graceDeadline.getTime() <= Date.now()) return;

  const ownerId = toOwnerObjectId(task.userId);
  const taskId = String(task._id);
  const title = String(task.title ?? '').trim() || 'Task reminder';
  const devices = await database.collection<PushDevice>('push_devices')
    .find({ userId: ownerId, deliveryMode: 'push' })
    .toArray();
  if (!devices.length) return;
  if (graceDeadline.getTime() <= Date.now()) return;

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8101').replace(/\/$/, '');
  const notification = {
    title: trimUtf8(title, 200),
    body: trimUtf8('Task due today', 1500),
  };
  const routePath = '/tabs/tasks';
  const data = {
    taskId,
    key: `task-reminder-${taskId}`,
    routePath,
    path: routePath,
    action: 'open_task',
    occurrenceAt: dateToIso(occurrenceAt),
    link: `${frontendUrl}${routePath}`,
  };
  // A rota vai na TAG, não só em `data`: no Android o
  // PushNotifications.getDeliveredNotifications() lê os extras da StatusBarNotification e NÃO
  // devolve o mapa `data` do FCM. Sem isto, abrir o app pelo ícone (com a notificação ainda na
  // bandeja) perde o destino e cai na rota padrão. Formato em sincronia com
  // android-app-starter/src/utils/pushNotificationTag.ts.
  const tag = trimUtf8(buildReminderPushNotificationTag(routePath, occurrenceAt.getTime()), 120);
  const fidDevices = devices.filter((device) => device.targetKind === 'fid');
  const tokenDevices = devices.filter((device) => device.targetKind === 'token');
  await Promise.all([
    sendToTargetKind(database, 'fid', fidDevices, notification, data, graceDeadline, tag),
    sendToTargetKind(database, 'token', tokenDevices, notification, data, graceDeadline, tag),
  ]);
}

export async function sendTestPush(
  database: Db,
  userIdValue: string | ObjectId,
  deviceId: string,
): Promise<{ targets: number; delivered: number }> {
  const userId = toOwnerObjectId(userIdValue);
  const devices = await database.collection<PushDevice>('push_devices')
    .find({ userId, deviceId, deliveryMode: 'push' })
    .toArray();
  if (!devices.length) return { targets: 0, delivered: 0 };

  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:8101').replace(/\/$/, '');
  const notification = {
    title: 'Android App Starter',
    body: 'Push notifications are working.',
  };
  const data = {
    action: 'open_notifications',
    routePath: '/tabs/notifications',
    path: '/tabs/notifications',
    link: `${frontendUrl}/tabs/notifications`,
  };
  const graceDeadline = new Date(Date.now() + 60_000);
  const tag = `starter-test-${deviceId}`;
  const fidDevices = devices.filter((device) => device.targetKind === 'fid');
  const tokenDevices = devices.filter((device) => device.targetKind === 'token');
  const delivered = await Promise.all([
    sendToTargetKind(database, 'fid', fidDevices, notification, data, graceDeadline, tag),
    sendToTargetKind(database, 'token', tokenDevices, notification, data, graceDeadline, tag),
  ]);
  return {
    targets: devices.length,
    delivered: delivered.reduce((total, count) => total + count, 0),
  };
}
