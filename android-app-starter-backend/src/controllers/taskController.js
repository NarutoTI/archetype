import logger from '../config/logger.js';
import {
  createTask,
  deleteTask,
  findAllByUser,
  findByIdForUser,
  findByUserAndYear,
  isValidLocalDate,
  isValidYear,
  updateTask
} from '../services/taskService.js';
import { ErrorCodes, sendError } from '../utils/errorHandler.js';

function getRequestUserId(req) {
  return req.user?._id?.toString() || req.user?.id;
}

function validateTaskPayload(data, { partial = false } = {}) {
  const titleProvided = Object.prototype.hasOwnProperty.call(data, 'title');
  const dueDateProvided = Object.prototype.hasOwnProperty.call(data, 'dueDate');

  if ((!partial || titleProvided) && (!data.title || typeof data.title !== 'string' || !data.title.trim())) {
    return 'Task title is required';
  }

  if ((!partial || dueDateProvided) && !isValidLocalDate(data.dueDate)) {
    return 'Task dueDate must be YYYY-MM-DD';
  }

  if (titleProvided && data.title.trim().length > 160) {
    return 'Task title is too long';
  }

  if (Object.prototype.hasOwnProperty.call(data, 'completed') && typeof data.completed !== 'boolean') {
    return 'Task completed must be boolean';
  }

  return null;
}

export async function listTasks(req, res) {
  try {
    const tasks = await findAllByUser(getRequestUserId(req));
    return res.json({ success: true, tasks });
  } catch (error) {
    logger.error({ err: error }, 'Error listing tasks');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to list tasks');
  }
}

export async function listTasksByYear(req, res) {
  try {
    const { year } = req.params;
    if (!isValidYear(year)) {
      return sendError(res, 400, ErrorCodes.INVALID_DATE_FORMAT, 'Invalid year');
    }

    const tasks = await findByUserAndYear(getRequestUserId(req), Number(year));
    return res.json({ success: true, tasks });
  } catch (error) {
    logger.error({ err: error }, 'Error listing tasks by year');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to list tasks');
  }
}

export async function getTask(req, res) {
  try {
    const task = await findByIdForUser(req.params.id, getRequestUserId(req));
    if (!task) {
      return sendError(res, 404, ErrorCodes.NOT_FOUND, 'Task not found');
    }

    return res.json({ success: true, task });
  } catch (error) {
    logger.error({ err: error }, 'Error getting task');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to get task');
  }
}

export async function createTaskController(req, res) {
  try {
    const validationError = validateTaskPayload(req.body);
    if (validationError) {
      return sendError(res, 422, ErrorCodes.VALIDATION_ERROR, validationError);
    }

    const task = await createTask(getRequestUserId(req), req.body);
    return res.status(201).json({ success: true, task });
  } catch (error) {
    logger.error({ err: error }, 'Error creating task');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to create task');
  }
}

export async function updateTaskController(req, res) {
  try {
    const validationError = validateTaskPayload(req.body, { partial: true });
    if (validationError) {
      return sendError(res, 422, ErrorCodes.VALIDATION_ERROR, validationError);
    }

    const task = await updateTask(req.params.id, getRequestUserId(req), req.body);
    if (!task) {
      return sendError(res, 404, ErrorCodes.NOT_FOUND, 'Task not found');
    }

    return res.json({ success: true, task });
  } catch (error) {
    logger.error({ err: error }, 'Error updating task');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to update task');
  }
}

export async function deleteTaskController(req, res) {
  try {
    const deleted = await deleteTask(req.params.id, getRequestUserId(req));
    if (!deleted) {
      return sendError(res, 404, ErrorCodes.NOT_FOUND, 'Task not found');
    }

    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting task');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Failed to delete task');
  }
}
