import { ObjectId } from 'mongodb';
import CrudRepository from '../repositories/crudRepository.js';
import logger from '../config/logger.js';
import type { CreateTaskInput, Task, UpdateTaskInput } from '../types/schemas.js';

type TaskDocument = Task & { _id?: ObjectId | string };

const taskRepository = new CrudRepository<TaskDocument>('tasks');

function normalizeTask(task: TaskDocument | null): Task | null {
  if (!task) return null;

  return {
    id: task._id?.toString() || task.id,
    userId: task.userId?.toString?.() || task.userId,
    title: task.title,
    dueDate: task.dueDate,
    completed: !!task.completed,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt
  };
}

export function isValidLocalDate(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
}

export function isValidYear(value: unknown): boolean {
  const year = Number(value);
  return Number.isInteger(year) && year >= 1900 && year <= 3000;
}

export async function findAllByUser(userId: string): Promise<Task[]> {
  try {
    const tasks = await taskRepository.getCollection()
      .find({ userId: String(userId) })
      .sort({ dueDate: 1, createdAt: 1 })
      .toArray();
    return tasks.map(normalizeTask).filter((task): task is Task => !!task);
  } catch (error) {
    logger.error({ err: error, userId }, 'Error finding tasks by user');
    throw error;
  }
}

export async function findByUserAndYear(userId: string, year: number): Promise<Task[]> {
  try {
    const yearPrefix = `${year}-`;
    const tasks = await taskRepository.getCollection()
      .find({
        userId: String(userId),
        dueDate: { $regex: `^${yearPrefix}` }
      })
      .sort({ dueDate: 1, createdAt: 1 })
      .toArray();
    return tasks.map(normalizeTask).filter((task): task is Task => !!task);
  } catch (error) {
    logger.error({ err: error, userId, year }, 'Error finding tasks by year');
    throw error;
  }
}

export async function findByIdForUser(id: string, userId: string): Promise<Task | null> {
  try {
    if (!ObjectId.isValid(id)) return null;
    return normalizeTask(await taskRepository.findOne({
      _id: ObjectId.createFromHexString(id),
      userId: String(userId)
    }));
  } catch (error) {
    logger.error({ err: error, id, userId }, 'Error finding task by id');
    throw error;
  }
}

export async function createTask(userId: string, data: CreateTaskInput): Promise<Task> {
  try {
    // Timestamps técnicos usam epoch ms; dueDate segue como data local YYYY-MM-DD.
    const now = Date.now();
    const task: TaskDocument = {
      userId: String(userId),
      title: data.title.trim(),
      dueDate: data.dueDate,
      completed: false,
      createdAt: now,
      updatedAt: now
    };

    const result = await taskRepository.insert(task);
    return normalizeTask({
      ...task,
      _id: result.insertedId
    }) as Task;
  } catch (error) {
    logger.error({ err: error, userId }, 'Error creating task');
    throw error;
  }
}

export async function updateTask(id: string, userId: string, data: UpdateTaskInput): Promise<Task | null> {
  try {
    if (!ObjectId.isValid(id)) return null;

    const update: Partial<TaskDocument> = {
      updatedAt: Date.now()
    };

    if (typeof data.title === 'string') {
      update.title = data.title.trim();
    }

    if (typeof data.dueDate === 'string') {
      update.dueDate = data.dueDate;
    }

    if (typeof data.completed === 'boolean') {
      update.completed = data.completed;
    }

    const response = await taskRepository.getCollection().findOneAndUpdate(
      {
        _id: ObjectId.createFromHexString(id),
        userId: String(userId)
      },
      { $set: update },
      { returnDocument: 'after' }
    );

    const updatedTask = response && 'value' in response ? response.value : response;
    return normalizeTask(updatedTask as TaskDocument | null);
  } catch (error) {
    logger.error({ err: error, id, userId }, 'Error updating task');
    throw error;
  }
}

export async function deleteTask(id: string, userId: string): Promise<boolean> {
  try {
    if (!ObjectId.isValid(id)) return false;
    const result = await taskRepository.getCollection().deleteOne({
      _id: ObjectId.createFromHexString(id),
      userId: String(userId)
    });
    return result.deletedCount > 0;
  } catch (error) {
    logger.error({ err: error, id, userId }, 'Error deleting task');
    throw error;
  }
}
