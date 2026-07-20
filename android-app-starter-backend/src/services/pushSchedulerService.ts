import type { Collection, Db, Document } from 'mongodb';
import logger from '../config/logger.js';
import { sendTaskReminderPush, validateFcmCredentials } from './fcmService.js';

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const TICK_MS = positiveNumber(process.env.PUSH_TICK_MS, 60_000);
const LATE_GRACE_MS = positiveNumber(process.env.PUSH_LATE_GRACE_MIN, 30) * 60_000;
const MAX_CLAIMS_PER_TICK = Math.floor(
  positiveNumber(process.env.PUSH_MAX_CLAIMS_PER_TICK, 200),
);
const SCHEDULER_DOCUMENT_PROJECTION = {
  _id: 1,
  userId: 1,
  title: 1,
  dueDate: 1,
  completed: 1,
  push: 1,
} as const;

let lastStartedAt: Date | null = null;
let lastSucceededAt: Date | null = null;
let lastErrorAt: Date | null = null;
let running = false;
let schedulerArmed = false;
let schedulerArmedAt: Date | null = null;
let startTimer: NodeJS.Timeout | null = null;
let intervalTimer: NodeJS.Timeout | null = null;

export function getSchedulerHealth() {
  const enabled = process.env.PUSH_SCHEDULER_ENABLED === 'true';
  const erroring = Boolean(lastErrorAt && (!lastSucceededAt || lastErrorAt > lastSucceededAt));
  const stale = Boolean(
    (lastSucceededAt && Date.now() - lastSucceededAt.getTime() > 3 * TICK_MS)
    || (
      schedulerArmed
      && schedulerArmedAt
      && !lastSucceededAt
      && Date.now() - schedulerArmedAt.getTime() > 3 * TICK_MS
    ),
  );
  const starting = enabled && !erroring && !stale && (!schedulerArmed || !lastSucceededAt);
  let status: 'disabled' | 'error' | 'starting' | 'stale' | 'ok';
  if (!enabled) status = 'disabled';
  else if (erroring) status = 'error';
  else if (starting) status = 'starting';
  else if (stale) status = 'stale';
  else status = 'ok';

  return {
    enabled,
    status,
    armed: schedulerArmed,
    armedAt: schedulerArmedAt,
    lastStartedAt,
    lastSucceededAt,
    lastErrorAt,
  };
}

export async function startPushScheduler(database: Db): Promise<void> {
  if (process.env.PUSH_SCHEDULER_ENABLED !== 'true') {
    schedulerArmed = false;
    schedulerArmedAt = null;
    logger.info('Push scheduler disabled (PUSH_SCHEDULER_ENABLED != true)');
    return;
  }
  try {
    await validateFcmCredentials();
  } catch (error) {
    schedulerArmed = false;
    schedulerArmedAt = null;
    lastErrorAt = new Date();
    logger.error({ err: error }, 'Push scheduler NOT started: invalid Firebase credentials');
    return;
  }
  const delay = TICK_MS - (Date.now() % TICK_MS);
  startTimer = setTimeout(() => {
    void tick(database);
    intervalTimer = setInterval(() => void tick(database), TICK_MS);
  }, delay);
  schedulerArmed = true;
  schedulerArmedAt = new Date();
  logger.info({ tickMs: TICK_MS, firstTickInMs: delay }, 'Push scheduler started');
}

export function stopPushScheduler(): void {
  if (startTimer) clearTimeout(startTimer);
  if (intervalTimer) clearInterval(intervalTimer);
  startTimer = null;
  intervalTimer = null;
  schedulerArmed = false;
  schedulerArmedAt = null;
}

export function _resetSchedulerHealthForTests(): void {
  stopPushScheduler();
  lastStartedAt = null;
  lastSucceededAt = null;
  lastErrorAt = null;
  running = false;
  schedulerArmed = false;
  schedulerArmedAt = null;
}

export async function tick(database: Db): Promise<void> {
  if (running) return;
  running = true;
  const now = new Date();
  lastStartedAt = now;
  try {
    const hasPushTarget = await database.collection('push_devices').findOne(
      { deliveryMode: 'push' },
      { projection: { _id: 1 } },
    );
    if (!hasPushTarget) {
      lastSucceededAt = new Date();
      return;
    }
    await drainDueTasks(database, database.collection('tasks'), now);
    lastSucceededAt = new Date();
  } catch (error) {
    lastErrorAt = new Date();
    logger.error({ err: error }, 'Push scheduler tick failed');
  } finally {
    running = false;
  }
}

/** One-shot Task schedules: claim → send → unset `push`. */
export async function drainDueTasks(
  database: Db,
  collection: Collection<Document>,
  now: Date,
): Promise<number> {
  let claims = 0;
  while (claims < MAX_CLAIMS_PER_TICK) {
    const document = await collection.findOne(
      { 'push.nextAtUtc': { $lte: now } },
      {
        sort: { 'push.nextAtUtc': 1 },
        projection: SCHEDULER_DOCUMENT_PROJECTION,
      },
    );
    if (!document) break;
    claims += 1;

    const occurrenceAt = document.push?.nextAtUtc;
    if (!(occurrenceAt instanceof Date) || !Number.isFinite(occurrenceAt.getTime())) {
      await collection.updateOne(
        { _id: document._id, 'push.nextAtUtc': occurrenceAt },
        {
          $unset: { 'push.nextAtUtc': '' },
          $set: { 'push.lastError': 'push.nextAtUtc must be a valid BSON Date' },
        },
      );
      logger.error({ taskId: document._id }, 'Quarantined invalid push.nextAtUtc');
      continue;
    }

    const lateByMs = now.getTime() - occurrenceAt.getTime();
    const claimed = await collection.findOneAndUpdate(
      { _id: document._id, 'push.nextAtUtc': occurrenceAt },
      { $unset: { push: '' } },
      {
        returnDocument: 'after',
        projection: SCHEDULER_DOCUMENT_PROJECTION,
      },
    );
    if (!claimed) continue;

    if (lateByMs > LATE_GRACE_MS) {
      logger.info({ taskId: document._id, lateByMs }, 'Skipped late push reminder');
      continue;
    }

    try {
      // Prefer pre-claim snapshot for title/userId (after-doc still has them).
      await sendTaskReminderPush(
        database,
        { ...document, ...(claimed as Document) },
        occurrenceAt,
        new Date(occurrenceAt.getTime() + LATE_GRACE_MS),
      );
    } catch (error) {
      logger.error(
        { err: error, taskId: document._id },
        'Push delivery failed after claim',
      );
    }
  }

  if (claims >= MAX_CLAIMS_PER_TICK) {
    logger.warn({ claims }, 'Push tick hit PUSH_MAX_CLAIMS_PER_TICK');
  }
  return claims;
}
