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

const notificationServiceMock = vi.hoisted(() => ({
  scheduleNotification: vi.fn(async () => 1),
  cancelNotification: vi.fn(async () => undefined),
  generateNotificationId: vi.fn((key: string) => key.length),
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

vi.mock('@/services/notification.service', () => ({
  notificationService: notificationServiceMock,
}));

import { useTaskStore } from '@/stores/taskStore';
import { useUserStore } from '@/stores/userStore';

const task = (overrides: Partial<Task> = {}): Task => ({
  id: '1',
  title: 'A',
  dueDate: '2026-06-10',
  completed: false,
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  ...overrides,
});

const user = (id: string) => ({
  id,
  name: id,
  email: `${id}@example.com`,
  provider: 'fake',
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
    notificationServiceMock.scheduleNotification.mockClear();
    notificationServiceMock.cancelNotification.mockClear();
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

  it('updateTask() moves a task across year caches when the due date changes year', async () => {
    taskServiceMock.getTasksForYear.mockResolvedValue([task({ id: '1', dueDate: '2026-06-10' })]);
    taskServiceMock.updateTask.mockResolvedValue(task({ id: '1', dueDate: '2027-03-05' }));

    const store = useTaskStore();
    await store.initialize();
    await store.updateTask('1', { dueDate: '2027-03-05' });

    expect(store.yearCache.has(2026)).toBe(false);
    expect(store.yearCache.get(2027)?.map((item) => item.id)).toEqual(['1']);
    expect(storage.has('starter-tasks-cache:anonymous:2027')).toBe(true);
    expect(storage.has('starter-tasks-cache:anonymous:2026')).toBe(false);
  });

  it('addTask() schedules a reminder and removeTask() cancels it', async () => {
    taskServiceMock.getTasksForYear.mockResolvedValue([]);
    taskServiceMock.createTask.mockResolvedValue(task({ id: 'created', dueDate: '2099-01-01' }));

    const store = useTaskStore();
    await store.initialize();
    await store.addTask('Future', '2099-01-01');

    expect(notificationServiceMock.scheduleNotification).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'task-reminder-created', date: '2099-01-01' }),
    );

    await store.removeTask('created');
    expect(notificationServiceMock.cancelNotification).toHaveBeenCalled();
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

  it('loadAllFromServer() does not reuse a pending sync from another user scope', async () => {
    const userStore = useUserStore();
    userStore.setCurrentUser(user('user-1'));

    let resolveUserOneSync: (value: Task[]) => void = () => {};
    taskServiceMock.getAll
      .mockImplementationOnce(() => new Promise<Task[]>((resolve) => { resolveUserOneSync = resolve; }))
      .mockResolvedValueOnce([task({ id: 'user-2-task', title: 'User 2' })]);

    const store = useTaskStore();
    const userOneSync = store.loadAllFromServer(true);

    userStore.setCurrentUser(user('user-2'));
    const userTwoSync = store.loadAllFromServer(true);

    expect(taskServiceMock.getAll).toHaveBeenCalledTimes(2);

    resolveUserOneSync([task({ id: 'stale-user-1-task', title: 'User 1' })]);
    await Promise.all([userOneSync, userTwoSync]);

    expect(store.tasks.map((item) => item.id)).toEqual(['user-2-task']);
    expect(storage.has('starter-tasks-cache:user-1:2026')).toBe(false);
    expect(storage.has('starter-tasks-cache:user-2:2026')).toBe(true);
  });
});
