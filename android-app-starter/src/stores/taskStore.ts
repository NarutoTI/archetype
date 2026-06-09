import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import taskService from '@/services/task.service';
import { isSameOrFutureDate } from '@/utils/date.utils';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/Task';

export const useTaskStore = defineStore('tasks', () => {
  let initialized = false;
  let initializePromise: Promise<void> | null = null;

  const tasks = ref<Task[]>([]);

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

  const initialize = async () => {
    if (initialized) return;
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      tasks.value = await taskService.getAll();
      initialized = true;
      logger.log(`TaskStore loaded ${tasks.value.length} task(s)`);
    })();

    try {
      await initializePromise;
    } finally {
      initializePromise = null;
    }
  };

  const persist = () => taskService.saveAll(tasks.value);

  const addTask = async (title: string, dueDate: string) => {
    if (!title.trim()) return;
    tasks.value = [...tasks.value, taskService.create(title, dueDate)];
    await persist();
  };

  const toggleTaskCompleted = async (id: string) => {
    tasks.value = tasks.value.map((task) =>
      task.id === id ? { ...task, completed: !task.completed } : task,
    );
    await persist();
  };

  const removeTask = async (id: string) => {
    tasks.value = tasks.value.filter((task) => task.id !== id);
    await persist();
  };

  const reset = async () => {
    tasks.value = [];
    initialized = false;
    await taskService.clear();
  };

  return {
    tasks,
    pendingTasks,
    completedTasks,
    upcomingCount,
    initialize,
    addTask,
    toggleTaskCompleted,
    removeTask,
    reset,
  };
});
