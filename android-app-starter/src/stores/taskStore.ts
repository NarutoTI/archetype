import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import i18n from '@/i18n';
import { useEntityBucketCache } from '@/composables/useEntityBucketCache';
import taskService, { type UpdateTaskPayload } from '@/services/task.service';
import { notificationService } from '@/services/notification.service';
import { dateToISOString, isPastDateTime, isSameOrFutureDate } from '@/utils/date.utils';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/Task';
import { useUserStore } from '@/stores/userStore';

const TASK_CACHE_PREFIX = 'starter-tasks-cache';
// Local notification fired on the task due date. Device-local by design:
// reminders are not synced across devices in this starter.
const TASK_REMINDER_TIME = '09:00';

const getTaskYear = (task: Pick<Task, 'dueDate'>): number => Number(task.dueDate.slice(0, 4));

const taskReminderKey = (id: string) => `task-reminder-${id}`;

export const useTaskStore = defineStore('tasks', () => {
  const userStore = useUserStore();
  let initializePromise: Promise<void> | null = null;
  let allTasksSyncPromise: Promise<Task[]> | null = null;

  // All cache mechanics (memory buckets, Preferences persistence, scope
  // guard, fetch dedupe) live in the generic composable. This store keeps
  // domain rules, network/loading policy and view state only.
  const cache = useEntityBucketCache<Task>({
    cachePrefix: TASK_CACHE_PREFIX,
    getScope: () => {
      const user = userStore.currentUser;
      return user?.id || user?.email || 'anonymous';
    },
    getItemBucket: getTaskYear,
    getItemId: (task) => task.id,
    compareItems: (a, b) => a.dueDate.localeCompare(b.dueDate),
  });

  const isLoading = ref(false);
  const isLoaded = ref(false);
  const selectedDate = ref(dateToISOString(new Date()));
  const selectedDateYear = computed(() => Number(selectedDate.value.slice(0, 4)));

  // `cache.items` is already globally sorted by dueDate (the bucket comparator
  // aligns with the year partition); filter() returns fresh arrays, so the
  // store state is never mutated by these derivations.
  const tasks = cache.items;

  const pendingTasks = computed(() => tasks.value.filter((task) => !task.completed));

  const completedTasks = computed(() =>
    tasks.value
      .filter((task) => task.completed)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
  );

  const upcomingCount = computed(() =>
    pendingTasks.value.filter((task) => isSameOrFutureDate(task.dueDate)).length,
  );

  const loadAllFromServer = async (silent = false): Promise<Task[]> => {
    if (allTasksSyncPromise) return allTasksSyncPromise;
    if (!silent) isLoading.value = true;

    const scopeAtStart = cache.currentScope();
    allTasksSyncPromise = (async () => {
      try {
        const data = await taskService.getAll();
        // Discard results that arrive after a user switch: they belong to the
        // previous scope and must not touch the new user's cache.
        if (cache.currentScope() === scopeAtStart) {
          await cache.replaceAll(data);
          logger.log(`TaskStore synced ${data.length} task(s) from backend`);
        }
        return data;
      } finally {
        if (!silent) isLoading.value = false;
        allTasksSyncPromise = null;
      }
    })();

    return allTasksSyncPromise;
  };

  // Network fetch for one year. Concurrent callers share the same request via
  // the cache dedupe; each caller still controls its own loading flag.
  const fetchYear = async (year: number, silent: boolean): Promise<Task[]> => {
    if (!silent) isLoading.value = true;
    try {
      return await cache.fetchBucket(year, () => taskService.getTasksForYear(year));
    } finally {
      if (!silent) isLoading.value = false;
    }
  };

  const loadYear = async (year: number, force = false, silent = false): Promise<Task[]> => {
    if (!force && cache.hasBucket(year)) {
      return cache.getBucket(year);
    }

    if (!force) {
      const cachedTasks = await cache.loadBucketFromStorage(year);
      if (cachedTasks?.length) {
        await cache.setBucket(year, cachedTasks, { persist: false });
        void fetchYear(year, true)
          .catch((error) => logger.error(`TaskStore background sync failed for year ${year}`, error));
        return cachedTasks;
      }
    }

    return fetchYear(year, silent);
  };

  const initialize = async () => {
    // When the scope changed (user switch), the composable already dropped the
    // in-memory cache; reset the store flag so data is loaded for the new user.
    if (cache.ensureScope()) {
      isLoaded.value = false;
    }
    if (isLoaded.value) return;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      const restored = await cache.initializeFromStorage();
      if (!restored) {
        await loadYear(selectedDateYear.value);
      }
      isLoaded.value = true;
      void loadAllFromServer(true).catch((error) => logger.error('TaskStore background sync failed', error));
    })();

    try {
      await initializePromise;
    } finally {
      initializePromise = null;
    }
  };

  // Best-effort device reminder for pending tasks with a future due date.
  // Notification failures must never block task CRUD, hence the broad catch.
  const syncTaskReminder = async (task: Task) => {
    try {
      const shouldRemind = !task.completed && !isPastDateTime(task.dueDate, TASK_REMINDER_TIME);
      if (shouldRemind) {
        await notificationService.scheduleNotification({
          key: taskReminderKey(task.id),
          title: i18n.global.t('tasks.reminderTitle'),
          body: i18n.global.t('tasks.reminderBody', { title: task.title }),
          date: task.dueDate,
          time: TASK_REMINDER_TIME,
        });
      } else {
        await cancelTaskReminder(task.id);
      }
    } catch (error) {
      logger.warn(`TaskStore: reminder sync failed for task ${task.id}`, error);
    }
  };

  const cancelTaskReminder = async (id: string) => {
    await notificationService.cancelNotification(
      notificationService.generateNotificationId(taskReminderKey(id)),
    );
  };

  const addTask = async (title: string, dueDate: string) => {
    if (!title.trim()) return;
    const createdTask = await taskService.createTask({ title, dueDate });
    await cache.upsertItem(createdTask);
    await syncTaskReminder(createdTask);
  };

  const updateTask = async (id: string, payload: UpdateTaskPayload): Promise<Task> => {
    const updatedTask = await taskService.updateTask(id, payload);
    await cache.upsertItem(updatedTask);
    await syncTaskReminder(updatedTask);
    return updatedTask;
  };

  const toggleTaskCompleted = async (id: string) => {
    const currentTask = tasks.value.find((task) => task.id === id);
    if (!currentTask) return;
    await updateTask(id, { completed: !currentTask.completed });
  };

  const removeTask = async (id: string) => {
    await taskService.deleteTask(id);
    await cache.removeItem(id);
    await cancelTaskReminder(id).catch((error) =>
      logger.warn(`TaskStore: reminder cancel failed for task ${id}`, error));
  };

  const reset = async () => {
    await cache.clear();
    isLoaded.value = false;
  };

  return {
    // Domain-friendly aliases: for tasks, the generic buckets are years.
    yearCache: cache.buckets,
    tasks,
    pendingTasks,
    completedTasks,
    upcomingCount,
    isLoading,
    isLoaded,
    loadedYears: cache.loadedBuckets,
    selectedDate,
    selectedDateYear,
    initialize,
    loadYear,
    loadAllFromServer,
    addTask,
    updateTask,
    toggleTaskCompleted,
    removeTask,
    reset,
  };
});
