import { defineStore } from 'pinia';
import { Preferences } from '@capacitor/preferences';
import { computed, ref, triggerRef } from 'vue';
import taskService from '@/services/task.service';
import { dateToISOString, isSameOrFutureDate } from '@/utils/date.utils';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/Task';
import { useUserStore } from '@/stores/userStore';

const TASK_CACHE_PREFIX = 'starter-tasks-cache';
const TASK_CACHE_YEARS_SUFFIX = 'years';

const getTaskYear = (task: Pick<Task, 'dueDate'>): number => Number(task.dueDate.slice(0, 4));

export const useTaskStore = defineStore('tasks', () => {
  const userStore = useUserStore();
  let initializePromise: Promise<void> | null = null;
  let allTasksSyncPromise: Promise<Task[]> | null = null;
  const inFlightYearFetches = new Map<number, Promise<Task[]>>();

  const yearCache = ref<Map<number, Task[]>>(new Map());
  const isLoading = ref(false);
  const isLoaded = ref(false);
  const selectedDate = ref(dateToISOString(new Date()));
  const selectedDateYear = computed(() => Number(selectedDate.value.slice(0, 4)));

  const loadedYears = computed(() => [...yearCache.value.keys()].sort((a, b) => a - b));

  const tasks = computed(() =>
    [...yearCache.value.values()]
      .flat()
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  );

  const pendingTasks = computed(() =>
    [...tasks.value]
      .filter((task) => !task.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
  );

  const completedTasks = computed(() =>
    [...tasks.value]
      .filter((task) => task.completed)
      .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
  );

  const upcomingCount = computed(() =>
    pendingTasks.value.filter((task) => isSameOrFutureDate(task.dueDate)).length,
  );

  const cacheScope = computed(() => {
    const user = userStore.currentUser;
    return user?.id || user?.email || 'anonymous';
  });

  const buildCacheKey = (year: number | typeof TASK_CACHE_YEARS_SUFFIX) =>
    `${TASK_CACHE_PREFIX}:${cacheScope.value}:${year}`;

  const groupTasksByYear = (items: Task[]) => {
    const grouped = new Map<number, Task[]>();
    for (const task of items) {
      const year = getTaskYear(task);
      if (!Number.isInteger(year)) continue;
      const yearTasks = grouped.get(year) || [];
      yearTasks.push(task);
      grouped.set(year, yearTasks);
    }

    for (const yearTasks of grouped.values()) {
      yearTasks.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    }

    return grouped;
  };

  const saveLoadedYearsToStorage = async () => {
    await Preferences.set({
      key: buildCacheKey(TASK_CACHE_YEARS_SUFFIX),
      value: JSON.stringify(loadedYears.value),
    });
  };

  const loadLoadedYearsFromStorage = async (): Promise<number[]> => {
    try {
      const { value } = await Preferences.get({ key: buildCacheKey(TASK_CACHE_YEARS_SUFFIX) });
      if (!value) return [];
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(Number).filter((year) => Number.isInteger(year))
        : [];
    } catch (error) {
      logger.error('TaskStore: failed to load cached years', error);
      return [];
    }
  };

  const saveCacheToStorage = async (year: number) => {
    const yearTasks = yearCache.value.get(year) || [];
    if (yearTasks.length) {
      await Preferences.set({
        key: buildCacheKey(year),
        value: JSON.stringify(yearTasks),
      });
    } else {
      await Preferences.remove({ key: buildCacheKey(year) });
    }
    await saveLoadedYearsToStorage();
  };

  const loadCacheFromStorage = async (year: number): Promise<Task[] | null> => {
    try {
      const { value } = await Preferences.get({ key: buildCacheKey(year) });
      if (!value) return null;
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Task[] : null;
    } catch (error) {
      logger.error(`TaskStore: failed to load cache for year ${year}`, error);
      return null;
    }
  };

  const replaceAllCaches = async (items: Task[]) => {
    const previousYears = loadedYears.value;
    yearCache.value = groupTasksByYear(items);
    const nextYears = loadedYears.value;
    const removedYears = previousYears.filter((year) => !nextYears.includes(year));
    await Promise.all([
      ...nextYears.map((year) => saveCacheToStorage(year)),
      ...removedYears.map((year) => Preferences.remove({ key: buildCacheKey(year) })),
    ]);
    await saveLoadedYearsToStorage();
    logger.log(`TaskStore synced ${items.length} task(s) from backend`);
  };

  const loadAllFromServer = async (silent = false): Promise<Task[]> => {
    if (allTasksSyncPromise) return allTasksSyncPromise;
    if (!silent) isLoading.value = true;

    allTasksSyncPromise = (async () => {
      try {
        const data = await taskService.getAll();
        await replaceAllCaches(data);
        return data;
      } finally {
        if (!silent) isLoading.value = false;
        allTasksSyncPromise = null;
      }
    })();

    return allTasksSyncPromise;
  };

  const loadYear = async (year: number, force = false, silent = false): Promise<Task[]> => {
    if (!force && yearCache.value.has(year)) {
      return yearCache.value.get(year) || [];
    }

    if (!force) {
      const cachedTasks = await loadCacheFromStorage(year);
      if (cachedTasks?.length) {
        yearCache.value.set(year, cachedTasks);
        triggerRef(yearCache);
        void taskService.getTasksForYear(year)
          .then(async (freshTasks) => {
            yearCache.value.set(year, freshTasks);
            triggerRef(yearCache);
            await saveCacheToStorage(year);
          })
          .catch((error) => logger.error(`TaskStore background sync failed for year ${year}`, error));
        return cachedTasks;
      }
    }

    const pendingFetch = inFlightYearFetches.get(year);
    if (pendingFetch) return pendingFetch;

    if (!silent) isLoading.value = true;
    const fetchPromise = (async () => {
      try {
        const data = await taskService.getTasksForYear(year);
        yearCache.value.set(year, data);
        triggerRef(yearCache);
        await saveCacheToStorage(year);
        return data;
      } finally {
        inFlightYearFetches.delete(year);
        if (!silent) isLoading.value = false;
      }
    })();

    inFlightYearFetches.set(year, fetchPromise);
    return fetchPromise;
  };

  const initialize = async () => {
    if (isLoaded.value) return;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      const cachedYears = await loadLoadedYearsFromStorage();
      if (cachedYears.length) {
        const cacheEntries = await Promise.all(
          cachedYears.map(async (year) => [year, await loadCacheFromStorage(year)] as const),
        );

        for (const [year, yearTasks] of cacheEntries) {
          if (yearTasks?.length) yearCache.value.set(year, yearTasks);
        }
        triggerRef(yearCache);
        isLoaded.value = true;
        void loadAllFromServer(true).catch((error) => logger.error('TaskStore background sync failed', error));
        return;
      }

      await loadYear(selectedDateYear.value);
      isLoaded.value = true;
      void loadAllFromServer(true).catch((error) => logger.error('TaskStore background sync failed', error));
    })();

    try {
      await initializePromise;
    } finally {
      initializePromise = null;
    }
  };

  const addTaskToLocalCache = async (task: Task) => {
    const year = getTaskYear(task);
    const yearTasks = yearCache.value.get(year) || [];
    yearCache.value.set(year, [...yearTasks, task].sort((a, b) => a.dueDate.localeCompare(b.dueDate)));
    triggerRef(yearCache);
    await saveCacheToStorage(year);
  };

  const updateTaskInLocalCache = async (task: Task) => {
    const targetYear = getTaskYear(task);
    const touchedYears = new Set<number>([targetYear]);

    for (const [year, yearTasks] of yearCache.value.entries()) {
      const index = yearTasks.findIndex((item) => item.id === task.id);
      if (index < 0) continue;

      touchedYears.add(year);
      const nextTasks = yearTasks.filter((item) => item.id !== task.id);
      if (nextTasks.length) {
        yearCache.value.set(year, nextTasks);
      } else {
        yearCache.value.delete(year);
      }
    }

    const targetTasks = yearCache.value.get(targetYear) || [];
    yearCache.value.set(
      targetYear,
      [...targetTasks, task].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    );

    triggerRef(yearCache);
    await Promise.all([...touchedYears].map((year) => saveCacheToStorage(year)));
  };

  const removeTaskFromLocalCache = async (id: string) => {
    const touchedYears: number[] = [];
    for (const [year, yearTasks] of yearCache.value.entries()) {
      if (!yearTasks.some((task) => task.id === id)) continue;
      const nextTasks = yearTasks.filter((task) => task.id !== id);
      if (nextTasks.length) {
        yearCache.value.set(year, nextTasks);
      } else {
        yearCache.value.delete(year);
      }
      touchedYears.push(year);
    }

    if (touchedYears.length) {
      triggerRef(yearCache);
      await Promise.all(touchedYears.map((year) => saveCacheToStorage(year)));
    }
  };

  const addTask = async (title: string, dueDate: string) => {
    if (!title.trim()) return;
    const createdTask = await taskService.createTask({ title, dueDate });
    await addTaskToLocalCache(createdTask);
  };

  const toggleTaskCompleted = async (id: string) => {
    const currentTask = tasks.value.find((task) => task.id === id);
    if (!currentTask) return;
    const updatedTask = await taskService.updateTask(id, { completed: !currentTask.completed });
    await updateTaskInLocalCache(updatedTask);
  };

  const removeTask = async (id: string) => {
    await taskService.deleteTask(id);
    await removeTaskFromLocalCache(id);
  };

  const reset = async () => {
    const years = loadedYears.value;
    yearCache.value.clear();
    triggerRef(yearCache);
    isLoaded.value = false;
    await Promise.all(years.map((year) => Preferences.remove({ key: buildCacheKey(year) })));
    await Preferences.remove({ key: buildCacheKey(TASK_CACHE_YEARS_SUFFIX) });
  };

  return {
    yearCache,
    tasks,
    pendingTasks,
    completedTasks,
    upcomingCount,
    isLoading,
    isLoaded,
    loadedYears,
    selectedDate,
    selectedDateYear,
    initialize,
    loadYear,
    loadAllFromServer,
    addTask,
    toggleTaskCompleted,
    removeTask,
    reset,
  };
});
