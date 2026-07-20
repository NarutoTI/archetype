import { describe, expect, it } from 'vitest';
import { materializeTaskPushSchedule } from '../../src/services/taskReminderScheduleService.js';

describe('materializeTaskPushSchedule', () => {
  it('builds a future nextAtUtc for dueDate + 09:00 in the account TZ', () => {
    const push = materializeTaskPushSchedule(
      { dueDate: '2099-06-15', completed: false },
      'America/Sao_Paulo',
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(push).not.toBeNull();
    expect(push?.tz).toBe('America/Sao_Paulo');
    // 2099-06-15 09:00 America/Sao_Paulo = 12:00 UTC (no DST in June for BRT historically -03)
    expect(push?.nextAtUtc?.toISOString()).toBe('2099-06-15T12:00:00.000Z');
  });

  it('returns null when the task is completed or past', () => {
    expect(materializeTaskPushSchedule(
      { dueDate: '2099-06-15', completed: true },
      'America/Sao_Paulo',
    )).toBeNull();

    expect(materializeTaskPushSchedule(
      { dueDate: '2020-01-01', completed: false },
      'America/Sao_Paulo',
      new Date('2026-01-01T00:00:00.000Z'),
    )).toBeNull();
  });
});
