import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  appStateCallbacks: [] as Array<(state: { isActive: boolean }) => void>,
  isNativePlatform: vi.fn(() => true),
  getDeliveredNotifications: vi.fn(),
  removeDeliveredNotifications: vi.fn(),
  getEntriesByIds: vi.fn(),
  removeEntriesByIds: vi.fn(),
  presentCustomAlert: vi.fn(),
  isAuthenticated: true,
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async (_event: string, cb: (state: { isActive: boolean }) => void) => {
      hoisted.appStateCallbacks.push(cb);
      return { remove: vi.fn() };
    }),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: hoisted.isNativePlatform,
  },
}));

vi.mock('@/services/boot', () => ({
  bootReadyPromise: Promise.resolve(),
}));

vi.mock('@/services/notification.service', () => ({
  notificationService: {
    getDeliveredNotifications: hoisted.getDeliveredNotifications,
    removeDeliveredNotifications: hoisted.removeDeliveredNotifications,
  },
}));

vi.mock('@/services/notificationLaunchIndex.service', () => ({
  notificationLaunchIndexService: {
    getEntriesByIds: hoisted.getEntriesByIds,
    removeEntriesByIds: hoisted.removeEntriesByIds,
  },
}));

vi.mock('@/services/alert.service', () => ({
  alertService: {
    presentCustomAlert: hoisted.presentCustomAlert,
  },
}));

vi.mock('@/stores/userStore', () => ({
  useUserStore: () => ({
    get isAuthenticated() {
      return hoisted.isAuthenticated;
    },
  }),
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    log: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string, params?: Record<string, unknown>) =>
        params?.count !== undefined ? `${key}:${params.count}` : key,
    },
  },
}));

function makeRouter(initialPath = '/tabs/tasks') {
  const currentRoute = { value: { path: initialPath } };
  return {
    isReady: vi.fn(async () => {}),
    push: vi.fn(async (target: string) => {
      currentRoute.value = { path: target };
    }),
    currentRoute,
  };
}

async function freshEntry() {
  vi.resetModules();
  hoisted.appStateCallbacks.length = 0;
  vi.clearAllMocks();
  hoisted.isNativePlatform.mockReturnValue(true);
  hoisted.getDeliveredNotifications.mockResolvedValue([]);
  hoisted.removeDeliveredNotifications.mockResolvedValue(undefined);
  hoisted.getEntriesByIds.mockResolvedValue([]);
  hoisted.removeEntriesByIds.mockResolvedValue(undefined);
  hoisted.presentCustomAlert.mockResolvedValue({ role: 'cancel' });
  hoisted.isAuthenticated = true;

  const mod = await import('@/services/notificationEntry');
  mod.notificationEntry._resetForTests();
  return mod.notificationEntry;
}

describe('notificationEntry', () => {
  beforeEach(() => {
    hoisted.appStateCallbacks.length = 0;
  });

  it('shows a delivered notification prompt and opens the route target', async () => {
    const entry = await freshEntry();
    const router = makeRouter();
    const delivered = [{ id: 101, title: 'Delivered', body: 'Delivered body' }];

    hoisted.getDeliveredNotifications.mockResolvedValue(delivered);
    hoisted.getEntriesByIds.mockResolvedValue([
      {
        id: 101,
        key: 'task-reminder-1',
        title: 'Reminder title',
        body: 'Reminder body',
        routePath: '/tabs/tasks',
        recordedAtMs: 1,
      },
    ]);
    hoisted.presentCustomAlert.mockResolvedValue({ role: 'open-target' });

    entry.install(router as any);
    const handled = await entry.dispatchIfDelivered('cold-start');

    expect(handled).toBe(true);
    expect(hoisted.presentCustomAlert).toHaveBeenCalledWith(expect.objectContaining({
      header: 'notifications.deliveredTitle',
      message: 'Reminder title\n\nReminder body',
      cssClass: 'alert-warning notification-delivered-alert',
    }));
    expect(hoisted.removeDeliveredNotifications).toHaveBeenCalledWith(delivered);
    expect(hoisted.removeEntriesByIds).toHaveBeenCalledWith([101]);
    expect(router.push).toHaveBeenCalledWith('/tabs/tasks');
  });

  it('falls back to the default path when the entry has no routePath', async () => {
    const entry = await freshEntry();
    const router = makeRouter('/tabs/menu');

    hoisted.getDeliveredNotifications.mockResolvedValue([{ id: 101, title: 'Delivered' }]);
    hoisted.getEntriesByIds.mockResolvedValue([
      { id: 101, key: 'k', title: 'Reminder title', recordedAtMs: 1 },
    ]);
    hoisted.presentCustomAlert.mockResolvedValue({ role: 'open-target' });

    entry.install(router as any);
    await entry.dispatchIfDelivered('cold-start');

    expect(router.push).toHaveBeenCalledWith('/tabs/tasks');
  });

  it('routes to the notifications tab when the user asks to view notifications', async () => {
    const entry = await freshEntry();
    const router = makeRouter();

    hoisted.getDeliveredNotifications.mockResolvedValue([{ id: 101, title: 'Delivered' }]);
    hoisted.getEntriesByIds.mockResolvedValue([
      { id: 101, key: 'k', title: 'Reminder title', recordedAtMs: 1 },
    ]);
    hoisted.presentCustomAlert.mockResolvedValue({ role: 'view-notifications' });

    entry.install(router as any);
    const handled = await entry.dispatchIfDelivered('cold-start');

    expect(handled).toBe(true);
    expect(router.push).toHaveBeenCalledWith('/tabs/notifications');
  });

  it('does not prompt when the user is not authenticated', async () => {
    const entry = await freshEntry();
    const router = makeRouter();
    hoisted.isAuthenticated = false;

    entry.install(router as any);
    const handled = await entry.dispatchIfDelivered('cold-start');

    expect(handled).toBe(false);
    expect(hoisted.getDeliveredNotifications).not.toHaveBeenCalled();
    expect(hoisted.presentCustomAlert).not.toHaveBeenCalled();
  });

  it('registers an app resume listener that dispatches delivered notifications', async () => {
    const entry = await freshEntry();
    const router = makeRouter();

    hoisted.getDeliveredNotifications.mockResolvedValue([{ id: 101, title: 'Delivered' }]);
    hoisted.getEntriesByIds.mockResolvedValue([
      { id: 101, key: 'k', title: 'Reminder title', recordedAtMs: 1 },
    ]);

    entry.install(router as any);
    expect(hoisted.appStateCallbacks).toHaveLength(1);

    hoisted.appStateCallbacks[0]({ isActive: true });
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(hoisted.presentCustomAlert).toHaveBeenCalled();
  });
});
