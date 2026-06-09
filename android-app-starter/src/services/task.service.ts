import { Preferences } from '@capacitor/preferences';
import { dateToISOString } from '@/utils/date.utils';
import { logger } from '@/utils/logger';
import type { Task } from '@/types/Task';

const TASKS_STORAGE_KEY = 'example-tasks';

class TaskService {
  async getAll(): Promise<Task[]> {
    const { value } = await Preferences.get({ key: TASKS_STORAGE_KEY });
    if (!value) return [];

    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed as Task[] : [];
    } catch (error) {
      logger.error('TaskService: failed to parse stored tasks', error);
      return [];
    }
  }

  async saveAll(tasks: Task[]): Promise<void> {
    await Preferences.set({
      key: TASKS_STORAGE_KEY,
      value: JSON.stringify(tasks),
    });
  }

  create(title: string, dueDate: string): Task {
    return {
      id: crypto.randomUUID(),
      title: title.trim(),
      dueDate,
      completed: false,
      createdAt: dateToISOString(new Date()),
    };
  }

  async clear(): Promise<void> {
    await Preferences.remove({ key: TASKS_STORAGE_KEY });
  }
}

export default new TaskService();
