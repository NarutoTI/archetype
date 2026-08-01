import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  appStateCallbacks: [] as Array<(state: { isActive: boolean }) => void>,
  isNativePlatform: vi.fn(() => true),
  isPluginAvailable: vi.fn(() => false),
  getDeliveredNotifications: vi.fn(),
  removeDeliveredNotifications: vi.fn(),
  getPushDeliveredNotifications: vi.fn(),
  removePushDeliveredNotifications: vi.fn(),
  getEntriesByIds: vi.fn(),
  removeEntriesByIds: vi.fn(),
  presentCustomAlert: vi.fn(),
  presentCustomActionSheet: vi.fn(),
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
    isPluginAvailable: hoisted.isPluginAvailable,
  },
}));

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    getDeliveredNotifications: hoisted.getPushDeliveredNotifications,
    removeDeliveredNotifications: hoisted.removePushDeliveredNotifications,
  },
}));

vi.mock('@/services/boot', () => ({
  bootReadyPromise: Promise.resolve(),
}));

vi.mock('@/services/localNotification.service', () => ({
  localNotificationService: {
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
    presentCustomActionSheet: hoisted.presentCustomActionSheet,
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
    warn: vi.fn(),
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
  hoisted.isPluginAvailable.mockReturnValue(false);
  hoisted.getDeliveredNotifications.mockResolvedValue([]);
  hoisted.removeDeliveredNotifications.mockResolvedValue(undefined);
  hoisted.getPushDeliveredNotifications.mockResolvedValue({ notifications: [] });
  hoisted.removePushDeliveredNotifications.mockResolvedValue(undefined);
  hoisted.getEntriesByIds.mockResolvedValue([]);
  hoisted.removeEntriesByIds.mockResolvedValue(undefined);
  hoisted.presentCustomAlert.mockResolvedValue({ role: 'cancel' });
  hoisted.presentCustomActionSheet.mockResolvedValue({ role: 'cancel' });
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

  it('opens a delivered push notification from the FCM tray', async () => {
    const entry = await freshEntry();
    const router = makeRouter();
    const pushNotification = {
      id: 'fcm-1',
      title: 'Push title',
      body: 'Push body',
      data: { routePath: '/tabs/tasks', key: 'task-1' },
    };

    hoisted.isPluginAvailable.mockReturnValue(true);
    hoisted.getPushDeliveredNotifications.mockResolvedValue({
      notifications: [pushNotification],
    });
    hoisted.presentCustomAlert.mockResolvedValue({ role: 'open-target' });

    entry.install(router as any);
    const handled = await entry.dispatchIfDelivered('cold-start');

    expect(handled).toBe(true);
    expect(hoisted.removePushDeliveredNotifications).toHaveBeenCalledWith({
      notifications: [pushNotification],
    });
    expect(router.push).toHaveBeenCalledWith('/tabs/tasks');
  });

  // Push sozinho na bandeja: abre direto, como se o usuário tivesse tocado na notificação.
  it('opens a single delivered push target without any prompt', async () => {
    const entry = await freshEntry();
    const router = makeRouter('/tabs/home');
    const pushNotification = {
      id: 0,
      title: 'Push title',
      data: { routePath: '/tabs/tasks', key: 'task-9' },
    };

    hoisted.isPluginAvailable.mockReturnValue(true);
    hoisted.getPushDeliveredNotifications.mockResolvedValue({ notifications: [pushNotification] });

    entry.install(router as any);
    const handled = await entry.dispatchIfDelivered('cold-start');

    expect(handled).toBe(true);
    expect(hoisted.presentCustomAlert).not.toHaveBeenCalled();
    expect(hoisted.presentCustomActionSheet).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/tabs/tasks');
  });

  // No Android a bandeja não devolve o mapa data do FCM: a rota vem da tag.
  it('recovers the route from the Android tag when FCM data is missing', async () => {
    const entry = await freshEntry();
    const router = makeRouter('/tabs/home');

    hoisted.isPluginAvailable.mockReturnValue(true);
    hoisted.getPushDeliveredNotifications.mockResolvedValue({
      notifications: [{
        id: 0,
        tag: 'push:route:%2Ftabs%2Ftasks:1720000000000',
        title: 'Push title',
        data: { 'android.title': 'Push title' },
      }],
    });

    entry.install(router as any);
    await entry.dispatchIfDelivered('cold-start');

    expect(router.push).toHaveBeenCalledWith('/tabs/tasks');
  });

  it('lists every push item in the chooser and opens the chosen one', async () => {
    const entry = await freshEntry();
    const router = makeRouter('/tabs/home');

    hoisted.isPluginAvailable.mockReturnValue(true);
    hoisted.getPushDeliveredNotifications.mockResolvedValue({
      notifications: [
        { id: 1, title: 'A', data: { routePath: '/tabs/tasks', key: 'a' } },
        { id: 2, title: 'B', data: { routePath: '/tabs/settings', key: 'b' } },
      ],
    });
    hoisted.presentCustomActionSheet.mockResolvedValue({ role: 'open-target', data: { index: 1 } });

    entry.install(router as any);
    await entry.dispatchIfDelivered('cold-start');

    const buttons = hoisted.presentCustomActionSheet.mock.calls[0][0].buttons;
    expect(buttons.filter((b: any) => b.role === 'open-target').map((b: any) => b.text)).toEqual(['A', 'B']);
    expect(buttons.some((b: any) => b.role === 'view-notifications')).toBe(false);
    expect(router.push).toHaveBeenCalledWith('/tabs/settings');
  });

  // Local tem fila de pendentes de verdade, então ganha a linha extra.
  it('adds view-notifications to the chooser when a local entry is present', async () => {
    const entry = await freshEntry();
    const router = makeRouter('/tabs/home');

    hoisted.getDeliveredNotifications.mockResolvedValue([
      { id: 11, title: 'Local A' },
      { id: 12, title: 'Local B' },
    ]);
    hoisted.getEntriesByIds.mockResolvedValue([
      { id: 11, key: 'k1', title: 'Local A', routePath: '/tabs/tasks', recordedAtMs: 1 },
      { id: 12, key: 'k2', title: 'Local B', routePath: '/tabs/settings', recordedAtMs: 2 },
    ]);
    hoisted.presentCustomActionSheet.mockResolvedValue({ role: 'view-notifications' });

    entry.install(router as any);
    await entry.dispatchIfDelivered('cold-start');

    const buttons = hoisted.presentCustomActionSheet.mock.calls[0][0].buttons;
    expect(buttons.filter((b: any) => b.role === 'open-target')).toHaveLength(2);
    expect(buttons.some((b: any) => b.role === 'view-notifications')).toBe(true);
  });
});
