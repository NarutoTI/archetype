import { ObjectId, type Db, type Document, type UpdateFilter } from 'mongodb';
import { getDb } from '../config/db.js';
import logger from '../config/logger.js';
import { TASK_REMINDER_TIME, type PushSchedule } from '../types/push.js';
import { isValidIanaTimeZone, zonedDateTimeToUtc } from '../utils/timezone.js';

export const DEFAULT_PUSH_TIMEZONE = process.env.PUSH_DEFAULT_TZ || 'America/Sao_Paulo';

export interface TaskReminderFields {
  userId: string | ObjectId;
  dueDate?: string | null;
  completed?: boolean;
  push?: PushSchedule;
}

function idCandidates(id: string | ObjectId): Array<string | ObjectId> {
  if (id instanceof ObjectId) return [id, id.toHexString()];
  return ObjectId.isValid(id) ? [id, ObjectId.createFromHexString(id)] : [id];
}

export async function resolveUserTimezone(
  userId: string | ObjectId,
  database: Db = getDb(),
): Promise<string> {
  const user = await database.collection('users').findOne(
    { _id: { $in: idCandidates(userId) } } as Document,
    { projection: { timezone: 1 } },
  );
  const configured = typeof user?.timezone === 'string' ? user.timezone : null;
  if (configured && isValidIanaTimeZone(configured)) return configured;

  if (configured) {
    logger.warn({ userId, configured }, 'Invalid account timezone; using push default');
  }
  if (!isValidIanaTimeZone(DEFAULT_PUSH_TIMEZONE)) {
    throw new Error(`PUSH_DEFAULT_TZ is not a valid IANA timezone: ${DEFAULT_PUSH_TIMEZONE}`);
  }
  return DEFAULT_PUSH_TIMEZONE;
}

/** One-shot: dueDate + fixed 09:00 in account TZ, only if still in the future. */
export function materializeTaskPushSchedule(
  task: Pick<TaskReminderFields, 'dueDate' | 'completed'>,
  timezone: string,
  after: Date = new Date(),
): PushSchedule | null {
  if (task.completed || !task.dueDate) return null;
  const nextAtUtc = zonedDateTimeToUtc(task.dueDate, TASK_REMINDER_TIME, timezone);
  if (!(nextAtUtc.getTime() > after.getTime())) return null;
  return { nextAtUtc, tz: timezone };
}

export async function addMaterializedPushToTask<T extends TaskReminderFields>(
  document: T,
  database?: Db,
  after: Date = new Date(),
): Promise<T> {
  try {
    const timezone = await resolveUserTimezone(document.userId, database ?? getDb());
    const push = materializeTaskPushSchedule(document, timezone, after);
    if (push) document.push = push;
    else delete document.push;
  } catch (error) {
    delete document.push;
    logger.error(
      { err: error, userId: document.userId },
      'Skipping push materialization for task; saving without push',
    );
  }
  return document;
}

export async function buildTaskPushScheduleUpdate(
  document: TaskReminderFields,
  database?: Db,
  after: Date = new Date(),
): Promise<UpdateFilter<Document>> {
  try {
    const timezone = await resolveUserTimezone(document.userId, database ?? getDb());
    const push = materializeTaskPushSchedule(document, timezone, after);
    return push ? { $set: { push } } : { $unset: { push: '' } };
  } catch (error) {
    logger.error(
      { err: error, userId: document.userId },
      'Skipping push rematerialization for task; unsetting push',
    );
    return { $unset: { push: '' } };
  }
}

export async function rematerializeUserTaskReminders(
  database: Db,
  userId: string | ObjectId,
  timezone: string,
): Promise<{ scanned: number; updated: number; skipped: number }> {
  if (!isValidIanaTimeZone(timezone)) throw new Error(`Invalid IANA timezone: ${timezone}`);

  const userKey = userId instanceof ObjectId ? userId.toHexString() : String(userId);
  const tasks = await database.collection('tasks').find({
    userId: userKey,
    $or: [{ completed: false }, { push: { $exists: true } }],
  }, {
    projection: { dueDate: 1, completed: 1, updatedAt: 1 },
  }).toArray();

  let updated = 0;
  let skipped = 0;
  for (const task of tasks) {
    try {
      const push = materializeTaskPushSchedule({
        dueDate: typeof task.dueDate === 'string' ? task.dueDate : null,
        completed: Boolean(task.completed),
      }, timezone);
      const filter: Document = { _id: task._id };
      if (task.updatedAt != null) filter.updatedAt = task.updatedAt;
      const result = await database.collection('tasks').updateOne(
        filter,
        push ? { $set: { push } } : { $unset: { push: '' } },
      );
      updated += result.modifiedCount;
    } catch (error) {
      skipped += 1;
      logger.error(
        { err: error, taskId: task._id },
        'Skipping malformed task during push rematerialization',
      );
    }
  }

  return { scanned: tasks.length, updated, skipped };
}
