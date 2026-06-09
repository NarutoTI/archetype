import { ObjectId } from 'mongodb';
import * as userService from '../services/userService.js';
import logger from '../config/logger.js';
import { sendError, ErrorCodes } from '../utils/errorHandler.js';

function buildSafeUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user._id?.toString() || user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    birthDate: user.birthDate,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
    provider: user.provider,
    accountStatus: user.accountStatus,
    emailVerified: user.emailVerified,
    isDevelopment: user.isDevelopment,
    language: user.language,
    picture: user.picture
  };
}

function getRequestUserId(req) {
  return req.user?._id?.toString() || req.user?.id;
}

export async function getCurrentUserProfile(req, res) {
  try {
    return res.json(buildSafeUser(req.user));
  } catch (error) {
    logger.error({ err: error }, 'Error getting current user profile');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

export async function getUserProfile(req, res) {
  try {
    const userId = req.params.id;
    if (!ObjectId.isValid(userId)) {
      return sendError(res, 400, ErrorCodes.INVALID_ID_FORMAT, 'Invalid user ID format');
    }

    if (getRequestUserId(req) !== userId) {
      return sendError(res, 403, ErrorCodes.ACCESS_DENIED, 'Access denied');
    }

    const user = await userService.findById(userId);
    if (!user) {
      return sendError(res, 404, ErrorCodes.USER_NOT_FOUND, 'User not found');
    }

    return res.json(buildSafeUser(user));
  } catch (error) {
    logger.error({ err: error }, 'Error getting user profile');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

export async function updateUserProfile(req, res) {
  try {
    const userId = req.params.id;
    const { name, phone, birthDate, language } = req.body;

    if (!ObjectId.isValid(userId)) {
      return sendError(res, 400, ErrorCodes.INVALID_ID_FORMAT, 'Invalid user ID format');
    }

    if (getRequestUserId(req) !== userId) {
      return sendError(res, 403, ErrorCodes.ACCESS_DENIED, 'Access denied');
    }

    const user = await userService.findById(userId);
    if (!user) {
      return sendError(res, 404, ErrorCodes.USER_NOT_FOUND, 'User not found');
    }

    if (name?.trim()) {
      user.name = name.trim();
    }

    if (phone !== undefined) {
      user.phone = phone?.trim() || undefined;
    }

    if (birthDate !== undefined) {
      user.birthDate = birthDate?.trim() || undefined;
    }

    if (language?.trim()) {
      user.language = language.trim();
    }

    await userService.update(user);
    const updatedUser = await userService.findById(userId);

    return res.json(buildSafeUser(updatedUser));
  } catch (error) {
    logger.error({ err: error }, 'Error updating user profile');
    return sendError(res, 500, ErrorCodes.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}
