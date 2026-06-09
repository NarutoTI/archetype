import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Task } from '@/types/Task';

const storage = new Map<string, string>();
const taskServiceMock = vi.hoisted(() => ({
  getAll: vi.fn(),
  getTasksForYear: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

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

vi.mock('@/services/task.service', () => ({
  default: taskServiceMock,
}));

import { useTaskStore } from '@/stores/taskStore';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: '1',
  title: 'A',
  dueDate: '2026-06-10',
  completed: false,
  createdAt: '2026-06-09',
  ...overrides,
});

describe('taskStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    storage.clear();
    taskServiceMock.getAll.mockReset();
    taskServiceMock.getTasksForYear.mockReset();
    taskServiceMock.createTask.mockReset();
    taskServiceMock.updateTask.mockReset();
    taskServiceMock.deleteTask.mockReset();
    taskServiceMock.getAll.mockImplementation(() => new Promise<Task[]>(() => {}));
    taskServiceMock.getTasksForYear.mockResolvedValue([]);
    taskServiceMock.createTask.mockImplementation(async (payload) => task({
      id: 'created',
      title: payload.title,
      dueDate: payload.dueDate,
    }));
    taskServiceMock.updateTask.mockImplementation(async (id, payload) => task({
      id,
      completed: !!payload.completed,
    }));
    taskServiceMock.deleteTask.mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  it('initialize() loads cached tasks from local storage before background sync', async () => {
    storage.set('starter-tasks-cache:anonymous:years', JSON.stringify([2026]));
    storage.set('starter-tasks-cache:anonymous:2026', JSON.stringify([task()]));
    taskServiceMock.getAll.mockImplementation(() => new Promise<Task[]>(() => {}));

    const store = useTaskStore();
    await store.initialize();

    expect(store.tasks).toHaveLength(1);
    expect(store.tasks[0].title).toBe('A');
    expect(taskServiceMock.getAll).toHaveBeenCalledOnce();
  });

  it('addTask() persists through the service and keeps pendingTasks sorted by dueDate', async () => {
    taskServiceMock.getTasksForYear.mockResolvedValue([]);
    taskServiceMock.createTask
      .mockResolvedValueOnce(task({ id: 'later', title: 'Later', dueDate: '2026-06-20' }))
      .mockResolvedValueOnce(task({ id: 'sooner', title: 'Sooner', dueDate: '2026-06-10' }));

    const store = useTaskStore();
    await store.initialize();
    await store.addTask('Later', '2026-06-20');
    await store.addTask('Sooner', '2026-06-10');

    expect(store.pendingTasks.map((item) => item.title)).toEqual(['Sooner', 'Later']);
    expect(storage.has('starter-tasks-cache:anonymous:2026')).toBe(true);
  });

  it('toggleTaskCompleted() updates the backend and moves a task between lists', async () => {
    taskServiceMock.getTasksForYear.mockResolvedValue([task({ id: '1', title: 'Do it' })]);
    taskServiceMock.updateTask.mockResolvedValue(task({ id: '1', title: 'Do it', completed: true }));

    const store = useTaskStore();
    await store.initialize();
    await store.toggleTaskCompleted('1');

    expect(taskServiceMock.updateTask).toHaveBeenCalledWith('1', { completed: true });
    expect(store.pendingTasks).toHaveLength(0);
    expect(store.completedTasks).toHaveLength(1);
  });

  it('removeTask() deletes remotely and removes the task from local cache', async () => {
    taskServiceMock.getTasksForYear.mockResolvedValue([task({ id: '1' })]);

    const store = useTaskStore();
    await store.initialize();
    await store.removeTask('1');

    expect(taskServiceMock.deleteTask).toHaveBeenCalledWith('1');
    expect(store.tasks).toHaveLength(0);
  });

  it('derived computed never mutates the source year cache arrays', async () => {
    taskServiceMock.getTasksForYear.mockResolvedValue([
      task({ id: 'b', title: 'B', dueDate: '2026-06-20' }),
      task({ id: 'a', title: 'A', dueDate: '2026-06-10' }),
    ]);

    const store = useTaskStore();
    await store.initialize();
    const original = store.yearCache.get(2026)?.map((item) => item.title);
    void store.pendingTasks;

    expect(store.yearCache.get(2026)?.map((item) => item.title)).toEqual(original);
  });
});
