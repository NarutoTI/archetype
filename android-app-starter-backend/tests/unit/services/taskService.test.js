import { ObjectId } from 'mongodb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setMockDb } from '../../../src/config/db.js';
import {
  createTask,
  findByUserAndYear,
  isValidLocalDate,
  updateTask
} from '../../../src/services/taskService.js';

const collection = {
  find: vi.fn(),
  findOneAndUpdate: vi.fn(),
  insertOne: vi.fn()
};

beforeEach(() => {
  vi.clearAllMocks();
  setMockDb({
    collection: vi.fn(() => collection)
  });
});

describe('taskService', () => {
  it('validates local YYYY-MM-DD dates', () => {
    expect(isValidLocalDate('2026-06-09')).toBe(true);
    expect(isValidLocalDate('2026-02-31')).toBe(false);
    expect(isValidLocalDate('2026-6-9')).toBe(false);
  });

  it('finds tasks by user and year', async () => {
    const taskId = new ObjectId();
    collection.find.mockReturnValue({
      sort: vi.fn(() => ({
        toArray: vi.fn(async () => [{
          _id: taskId,
          userId: 'user-1',
          title: 'A',
          dueDate: '2026-06-09',
          completed: false,
          createdAt: '2026-06-09',
          updatedAt: 123
        }])
      }))
    });

    const tasks = await findByUserAndYear('user-1', 2026);

    expect(collection.find).toHaveBeenCalledWith({
      userId: 'user-1',
      dueDate: { $regex: '^2026-' }
    });
    expect(tasks).toEqual([{
      id: taskId.toString(),
      userId: 'user-1',
      title: 'A',
      dueDate: '2026-06-09',
      completed: false,
      createdAt: '2026-06-09',
      updatedAt: 123
    }]);
  });

  it('creates a task owned by the current user', async () => {
    const taskId = new ObjectId();
    collection.insertOne.mockResolvedValue({ insertedId: taskId });

    const created = await createTask('user-1', {
      title: '  Do it  ',
      dueDate: '2026-06-09'
    });

    expect(collection.insertOne).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      title: 'Do it',
      dueDate: '2026-06-09',
      completed: false
    }));
    expect(created.id).toBe(taskId.toString());
  });

  it('updates only the owner task', async () => {
    const taskId = new ObjectId();
    collection.findOneAndUpdate.mockResolvedValue({
      _id: taskId,
      userId: 'user-1',
      title: 'Done',
      dueDate: '2026-06-09',
      completed: true,
      createdAt: '2026-06-09',
      updatedAt: 456
    });

    const updated = await updateTask(taskId.toString(), 'user-1', { completed: true });

    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: taskId, userId: 'user-1' },
      { $set: expect.objectContaining({ completed: true }) },
      { returnDocument: 'after' }
    );
    expect(updated.completed).toBe(true);
  });
});
