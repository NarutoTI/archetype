import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const storage = new Map<string, string>();

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: storage.get(key) ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      storage.set(key, value);
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      storage.delete(key);
    }),
  },
}));

import { useTaskStore } from '@/stores/taskStore';

describe('taskStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storage.clear();
    setActivePinia(createPinia());
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000000');
  });

  it('initialize() loads persisted tasks from local storage', async () => {
    storage.set('example-tasks', JSON.stringify([
      { id: '1', title: 'A', dueDate: '2026-06-10', completed: false, createdAt: '2026-06-09' },
    ]));

    const store = useTaskStore();
    await store.initialize();

    expect(store.tasks).toHaveLength(1);
  });

  it('addTask() persists and pendingTasks comes sorted by dueDate', async () => {
    const store = useTaskStore();
    await store.initialize();

    await store.addTask('Later', '2026-06-20');
    await store.addTask('Sooner', '2026-06-10');

    expect(store.pendingTasks.map((task) => task.title)).toEqual(['Sooner', 'Later']);
    expect(storage.has('example-tasks')).toBe(true);
  });

  it('toggleTaskCompleted() moves a task between pending and completed', async () => {
    const store = useTaskStore();
    await store.initialize();

    await store.addTask('Do it', '2026-06-10');
    await store.toggleTaskCompleted(store.pendingTasks[0].id);

    expect(store.pendingTasks).toHaveLength(0);
    expect(store.completedTasks).toHaveLength(1);
  });

  it('derived computed never mutates the source array', async () => {
    const store = useTaskStore();
    await store.initialize();

    await store.addTask('B', '2026-06-20');
    await store.addTask('A', '2026-06-10');

    const original = store.tasks.map((task) => task.title);
    void store.pendingTasks;

    expect(store.tasks.map((task) => task.title)).toEqual(original);
  });
});
