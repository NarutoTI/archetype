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
// Notificação local disparada no vencimento da tarefa. Por desenho, ela fica
// só no aparelho e não sincroniza entre dispositivos neste starter.
const TASK_REMINDER_TIME = '09:00';

const getTaskYear = (task: Pick<Task, 'dueDate'>): number => Number(task.dueDate.slice(0, 4));

const taskReminderKey = (id: string) => `task-reminder-${id}`;
type ScopedJob<T> = { id: symbol; scope: string; promise: Promise<T> };

export const useTaskStore = defineStore('tasks', () => {
  const userStore = useUserStore();
  let initializeJob: ScopedJob<void> | null = null;
  let allTasksSyncJob: ScopedJob<Task[]> | null = null;

  // A mecânica de cache fica no composable genérico. A store mantém apenas
  // regras de domínio, política de rede/loading e estado usado pela tela.
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

  // `cache.items` já vem ordenado por `dueDate`: os buckets são anos e o
  // comparador interno também usa a data. Os filtros abaixo criam novos arrays.
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
    const scopeAtStart = cache.currentScope();
    if (allTasksSyncJob?.scope === scopeAtStart) return allTasksSyncJob.promise;
    if (!silent) isLoading.value = true;

    const jobId = Symbol('tasks-sync');
    const promise = (async () => {
      try {
        const data = await taskService.getAll();
        // Respostas antigas são descartadas quando o usuário muda no meio do voo.
        if (cache.currentScope() === scopeAtStart) {
          await cache.replaceAll(data);
          logger.log(`TaskStore synced ${data.length} task(s) from backend`);
        }
        return data;
      } finally {
        const scopeStillCurrent = cache.currentScope() === scopeAtStart;
        if (scopeStillCurrent && !silent) isLoading.value = false;
        if (allTasksSyncJob?.id === jobId) allTasksSyncJob = null;
      }
    })();

    allTasksSyncJob = { id: jobId, scope: scopeAtStart, promise };
    return promise;
  };

  // Busca de um ano. Chamadas concorrentes compartilham a request pelo cache,
  // mas cada chamada ainda controla se exibe loading ou roda em silêncio.
  const fetchYear = async (year: number, silent: boolean): Promise<Task[]> => {
    const scopeAtStart = cache.currentScope();
    if (!silent) isLoading.value = true;
    try {
      return await cache.fetchBucket(year, () => taskService.getTasksForYear(year));
    } finally {
      if (!silent && cache.currentScope() === scopeAtStart) isLoading.value = false;
    }
  };

  const loadYear = async (year: number, force = false, silent = false): Promise<Task[]> => {
    const scopeAtStart = cache.currentScope();
    if (!force && cache.hasBucket(year)) {
      return cache.getBucket(year);
    }

    if (!force) {
      const cachedTasks = await cache.loadBucketFromStorage(year);
      if (cache.currentScope() !== scopeAtStart) return [];
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
    // Normalmente o auth chama reset({ removePersisted: false }) na troca de
    // usuário. Este guard fica como defesa para usos diretos da store.
    if (cache.ensureScope()) {
      clearRuntimeState();
    }
    if (isLoaded.value) return;
    const scopeAtStart = cache.currentScope();
    if (initializeJob?.scope === scopeAtStart) return initializeJob.promise;

    const jobId = Symbol('tasks-init');
    const promise = (async () => {
      const restored = await cache.initializeFromStorage();
      if (cache.currentScope() !== scopeAtStart) return;
      if (!restored) {
        await loadYear(selectedDateYear.value);
        if (cache.currentScope() !== scopeAtStart) return;
      }
      isLoaded.value = true;
      void loadAllFromServer(true).catch((error) => logger.error('TaskStore background sync failed', error));
    })();

    initializeJob = { id: jobId, scope: scopeAtStart, promise };
    try {
      await promise;
    } finally {
      if (initializeJob?.id === jobId) initializeJob = null;
    }
  };

  // Lembrete local de melhor esforço para tarefas pendentes no futuro. Falhas de
  // notificação nunca devem bloquear o CRUD.
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
          // Exemplo: para onde a ação "Abrir" navega quando o app é aberto pelo
          // ícone com badge. Apps reais podem apontar para a rota de detalhe.
          extra: { routePath: '/tabs/tasks' },
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

  const clearRuntimeState = () => {
    initializeJob = null;
    allTasksSyncJob = null;
    isLoading.value = false;
    isLoaded.value = false;
  };

  const reset = async (options: { removePersisted?: boolean } = {}) => {
    clearRuntimeState();
    await cache.clear({ removePersisted: options.removePersisted ?? true });
  };

  return {
    // Alias de domínio: em Tasks, os buckets genéricos são anos.
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
