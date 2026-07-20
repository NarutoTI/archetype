import type { ObjectId } from 'mongodb';

export type PushTargetKind = 'fid' | 'token';
export type PushPlatform = 'android' | 'web';
export type ReminderDeliveryMode = 'push' | 'local';

/** Embedded on `tasks` — never expose on public Task wire. */
export interface PushSchedule {
  nextAtUtc?: Date;
  tz: string;
  lastClaimedAtUtc?: Date;
  lastError?: string;
}

export interface PushDevice {
  _id?: ObjectId | string | null;
  deviceId: string;
  userId: ObjectId | string;
  targetId: string;
  targetKind: PushTargetKind;
  platform: PushPlatform;
  deliveryMode: ReminderDeliveryMode;
  timezone: string;
  language?: string | null;
  appVersion?: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  failCount: number;
}

/** Matches frontend `TASK_REMINDER_TIME` in taskStore. */
export const TASK_REMINDER_TIME = '09:00';
