import api from '@/services/api.service';
import type { Task } from '@/types/Task';

export type CreateTaskPayload = Pick<Task, 'title' | 'dueDate'>;
export type UpdateTaskPayload = Partial<Pick<Task, 'title' | 'dueDate' | 'completed'>>;

class TaskService {
  async getAll(): Promise<Task[]> {
    const response = await api.get('/tasks');
    return response.data.tasks || [];
  }

  async getTasksForYear(year: number): Promise<Task[]> {
    const response = await api.get(`/tasks/year/${year}`);
    return response.data.tasks || [];
  }

  async createTask(payload: CreateTaskPayload): Promise<Task> {
    const response = await api.post('/tasks', {
      title: payload.title.trim(),
      dueDate: payload.dueDate,
    });
    return response.data.task;
  }

  async updateTask(id: string, payload: UpdateTaskPayload): Promise<Task> {
    const response = await api.put(`/tasks/${id}`, payload);
    return response.data.task;
  }

  async deleteTask(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`);
  }
}

export default new TaskService();
