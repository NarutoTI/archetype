import { ObjectId, type Db, type WithId } from 'mongodb';
import { getDb } from '../config/db.js';
import type {
  PushDevice,
  PushPlatform,
  PushTargetKind,
  ReminderDeliveryMode,
} from '../types/push.js';
import { isValidIanaTimeZone } from '../utils/timezone.js';
import { rematerializeUserTaskReminders } from './taskReminderScheduleService.js';

const MAX_DEVICES_PER_USER = 10;

export class PushDeviceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushDeviceConflictError';
  }
}

export interface RegisterPushDeviceInput {
  deviceId: string;
  targetId: string;
  targetKind: PushTargetKind;
  platform: PushPlatform;
  deliveryMode?: ReminderDeliveryMode;
  timezone: string;
  language?: string | null;
  appVersion?: string | null;
}

function toObjectId(userId: string | ObjectId): ObjectId {
  return userId instanceof ObjectId ? userId : ObjectId.createFromHexString(userId);
}

async function reconcileAccountTimezone(
  database: Db,
  userId: ObjectId,
  suggestedTimezone: string,
): Promise<string> {
  const user = await database.collection('users').findOne(
    { _id: userId },
    { projection: { timezone: 1 } },
  );
  const activeTimezones = await database.collection<PushDevice>('push_devices')
    .distinct('timezone', { userId });
  const currentTimezone = typeof user?.timezone === 'string' ? user.timezone : null;
  const unambiguous = activeTimezones.length === 1
    && activeTimezones[0] === suggestedTimezone;

  if (unambiguous && currentTimezone !== suggestedTimezone) {
    await database.collection('users').updateOne(
      { _id: userId },
      { $set: { timezone: suggestedTimezone, updatedAt: new Date() } },
    );
    await rematerializeUserTaskReminders(database, userId, suggestedTimezone);
    return suggestedTimezone;
  }
  return currentTimezone ?? suggestedTimezone;
}

export async function registerPushDevice(
  userIdValue: string | ObjectId,
  input: RegisterPushDeviceInput,
  database: Db = getDb(),
): Promise<{ device: WithId<PushDevice>; accountTimezone: string }> {
  if (!isValidIanaTimeZone(input.timezone)) {
    throw new Error('Invalid IANA timezone');
  }
  const userId = toObjectId(userIdValue);
  const now = new Date();
  const collection = database.collection<PushDevice>('push_devices');

  await collection.deleteMany({
    userId,
    targetKind: input.targetKind,
    targetId: input.targetId,
    deviceId: { $ne: input.deviceId },
  });

  const foreignOwner = await collection.findOne(
    {
      targetKind: input.targetKind,
      targetId: input.targetId,
      userId: { $ne: userId },
      deviceId: { $ne: input.deviceId },
    },
    { projection: { _id: 1 } },
  );
  if (foreignOwner) {
    throw new PushDeviceConflictError('Push target is already registered to another account');
  }

  const device = await collection.findOneAndUpdate(
    { deviceId: input.deviceId },
    {
      $set: {
        userId,
        targetId: input.targetId,
        targetKind: input.targetKind,
        platform: input.platform,
        deliveryMode: input.deliveryMode ?? 'push',
        timezone: input.timezone,
        language: input.language ?? null,
        appVersion: input.appVersion ?? null,
        lastSeenAt: now,
        failCount: 0,
      },
      $setOnInsert: { deviceId: input.deviceId, createdAt: now },
    },
    { upsert: true, returnDocument: 'after' },
  );
  if (!device) throw new Error('Push device was not persisted');

  const staleDevices = await collection.find({ userId })
    .sort({ lastSeenAt: -1 })
    .skip(MAX_DEVICES_PER_USER)
    .project({ _id: 1 })
    .toArray();
  if (staleDevices.length) {
    await collection.deleteMany({ _id: { $in: staleDevices.map((item) => item._id) } });
  }

  const accountTimezone = await reconcileAccountTimezone(database, userId, input.timezone);
  return { device, accountTimezone };
}

export async function getPushDevice(
  userIdValue: string | ObjectId,
  deviceId: string,
  database: Db = getDb(),
): Promise<{ device: WithId<PushDevice> | null; accountTimezone: string | null }> {
  const userId = toObjectId(userIdValue);
  const [device, user] = await Promise.all([
    database.collection<PushDevice>('push_devices').findOne({ userId, deviceId }),
    database.collection('users').findOne({ _id: userId }, { projection: { timezone: 1 } }),
  ]);
  return {
    device,
    accountTimezone: typeof user?.timezone === 'string' ? user.timezone : null,
  };
}

export async function setPushDeviceDeliveryMode(
  userIdValue: string | ObjectId,
  deviceId: string,
  deliveryMode: ReminderDeliveryMode,
  database: Db = getDb(),
): Promise<boolean> {
  const userId = toObjectId(userIdValue);
  const result = await database.collection<PushDevice>('push_devices').updateOne(
    { userId, deviceId },
    { $set: { deliveryMode, lastSeenAt: new Date() } },
  );
  return result.matchedCount > 0;
}

export async function removePushDevice(
  userIdValue: string | ObjectId,
  deviceId: string,
  database: Db = getDb(),
): Promise<boolean> {
  const result = await database.collection<PushDevice>('push_devices').deleteOne({
    userId: toObjectId(userIdValue),
    deviceId,
  });
  return result.deletedCount > 0;
}

export async function setAccountTimezone(
  userIdValue: string | ObjectId,
  timezone: string,
  database: Db = getDb(),
): Promise<void> {
  if (!isValidIanaTimeZone(timezone)) throw new Error('Invalid IANA timezone');
  const userId = toObjectId(userIdValue);
  await database.collection('users').updateOne(
    { _id: userId },
    { $set: { timezone, updatedAt: new Date() } },
  );
  await rematerializeUserTaskReminders(database, userId, timezone);
}
