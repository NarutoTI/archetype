import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  capacitor: {
    getPlatform: vi.fn(() => 'web'),
    isNativePlatform: vi.fn(() => false),
    isPluginAvailable: vi.fn(() => true),
  },
  localNotifications: {
    registerActionTypes: vi.fn(async () => {}),
    createChannel: vi.fn(async () => {}),
    checkPermissions: vi.fn(async () => ({ display: 'granted' })),
    requestPermissions: vi.fn(async () => ({ display: 'granted' })),
    schedule: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
    getPending: vi.fn(async () => ({ notifications: [] })),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: hoisted.capacitor,
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: hoisted.localNotifications,
  Weekday: {
    Sunday: 1,
    Monday: 2,
    Tuesday: 3,
    Wednesday: 4,
    Thursday: 5,
    Friday: 6,
    Saturday: 7,
  },
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string) => key,
    },
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/services/alert.service', () => ({
  alertService: {
    presentCustomAlert: vi.fn(),
  },
}));

vi.mock('@/services/capacitor.service', () => ({
  capacitorService: {
    openSettingsWithCallback: vi.fn(),
  },
}));

import { notificationService } from '@/services/notification.service';

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (notificationService as { platform?: string; isSupported?: boolean }).platform = 'web';
    (notificationService as { platform?: string; isSupported?: boolean }).isSupported = true;
    (notificationService as { initialized?: boolean }).initialized = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generateNotificationId() returns a stable positive id for the same key', () => {
    const first = notificationService.generateNotificationId('task-reminder-1');
    const second = notificationService.generateNotificationId('task-reminder-1');

    expect(first).toBe(second);
    expect(first).toBeGreaterThan(0);
  });

  it('scheduleNotification() schedules a one-off reminder on supported platforms', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 10, 9, 0, 0));

    const id = await notificationService.scheduleNotification({
      key: 'task-reminder-created',
      title: 'Task due',
      body: 'Buy bread',
      date: '2026-06-20',
      time: '09:00',
    });

    expect(id).toBe(notificationService.generateNotificationId('task-reminder-created'));
    expect(hoisted.localNotifications.schedule).toHaveBeenCalledWith(
      expect.objectContaining({
        notifications: [
          expect.objectContaining({
            id,
            title: 'Task due',
            body: 'Buy bread',
            extra: expect.objectContaining({ key: 'task-reminder-created' }),
          }),
        ],
      }),
    );
  });
});
