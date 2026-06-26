import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const preferencesStore = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({
      value: preferencesStore.get(key) ?? null,
    })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      preferencesStore.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      preferencesStore.delete(key);
    }),
  },
}));

vi.mock('@/utils/logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

describe('notificationLaunchIndexService', () => {
  beforeEach(() => {
    preferencesStore.clear();
    setActivePinia(createPinia());
  });

  it('stores and reads entries in the current user scope', async () => {
    const { useUserStore } = await import('@/stores/userStore');
    useUserStore().setCurrentUser({ id: 'user-1' } as any);

    const { notificationLaunchIndexService } = await import('@/services/notificationLaunchIndex.service');

    await notificationLaunchIndexService.upsertEntries([
      {
        id: 101,
        key: 'task-reminder-1',
        title: 'Reminder title',
        body: 'Reminder body',
        routePath: '/tabs/tasks',
        scheduledAtMs: 100,
      },
    ]);

    expect(preferencesStore.has('starter-notification-launch-index:user-1')).toBe(true);

    const entries = await notificationLaunchIndexService.getEntriesByIds([101]);
    expect(entries).toMatchObject([
      {
        id: 101,
        key: 'task-reminder-1',
        title: 'Reminder title',
        body: 'Reminder body',
        routePath: '/tabs/tasks',
      },
    ]);
    expect(entries[0].recordedAtMs).toEqual(expect.any(Number));
  });

  it('does not write when there is no authenticated user scope', async () => {
    const { notificationLaunchIndexService } = await import('@/services/notificationLaunchIndex.service');

    await notificationLaunchIndexService.upsertEntries([
      { id: 101, key: 'task-reminder-1', title: 'One' },
    ]);

    expect(preferencesStore.size).toBe(0);
    expect(await notificationLaunchIndexService.getEntriesByIds([101])).toHaveLength(0);
  });

  it('removes entries by notification id and clears the scope when empty', async () => {
    const { useUserStore } = await import('@/stores/userStore');
    useUserStore().setCurrentUser({ id: 'user-1' } as any);

    const { notificationLaunchIndexService } = await import('@/services/notificationLaunchIndex.service');

    await notificationLaunchIndexService.upsertEntries([
      { id: 101, key: 'task-reminder-1', title: 'One' },
      { id: 102, key: 'task-reminder-2', title: 'Two' },
    ]);

    await notificationLaunchIndexService.removeEntriesByIds([101]);
    expect(await notificationLaunchIndexService.getEntriesByIds([101, 102])).toHaveLength(1);

    await notificationLaunchIndexService.removeEntriesByIds([102]);
    expect(await notificationLaunchIndexService.getEntriesByIds([101, 102])).toHaveLength(0);
    expect(preferencesStore.has('starter-notification-launch-index:user-1')).toBe(false);
  });
});
