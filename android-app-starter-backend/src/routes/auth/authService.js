import bcrypt from 'bcrypt';
import { generateJWT, verifyJWT } from '../../config/passport.js';
import { emailService } from '../../services/email.service.js';
import * as userService from '../../services/userService.js';
import logger from '../../config/logger.js';
import {
  USER_PROVIDERS,
  TOKEN_TYPES,
  ERROR_CODES,
  VALIDATION_RULES,
  TOKEN_EXPIRY
} from './authConsts.js';

const parseLocalDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
};

export async function hashPassword(plainPassword) {
  if (!plainPassword) {
    throw new Error('Password is required for hashing');
  }
  return bcrypt.hash(plainPassword, VALIDATION_RULES.BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(plainPassword, hashedPassword) {
  if (!plainPassword || !hashedPassword) {
    return false;
  }

  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    logger.error({ err: error }, 'Password comparison failed');
    return false;
  }
}

export function validatePasswordStrength(password) {
  const errors = [];

  if (!password) {
    errors.push('Password is required');
    return { isValid: false, errors };
  }

  if (password.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters long`);
  }

  if (password.length > VALIDATION_RULES.PASSWORD_MAX_LENGTH) {
    errors.push(`Password must be less than ${VALIDATION_RULES.PASSWORD_MAX_LENGTH} characters long`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export function generateAuthToken(user, tokenType = TOKEN_TYPES.AUTH) {
  const expiresIn = TOKEN_EXPIRY[tokenType.toUpperCase()] || TOKEN_EXPIRY.AUTH;
  return generateJWT({
    id: user._id?.toString() || user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    tokenType
  }, expiresIn);
}

export function generateSpecialToken(user, tokenType) {
  const expiresIn = TOKEN_EXPIRY[tokenType.toUpperCase()] || TOKEN_EXPIRY.EMAIL_CONFIRMATION;
  return generateJWT({
    id: user._id?.toString() || user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    tokenType
  }, expiresIn);
}

export function verifyToken(token) {
  if (!token) {
    throw new Error(ERROR_CODES.MISSING_TOKEN);
  }

  try {
    return verifyJWT(token);
  } catch (error) {
    logger.warn('Token verification failed: %s', error.message);
    if (error.name === 'TokenExpiredError') {
      throw new Error(ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new Error(ERROR_CODES.INVALID_TOKEN);
  }
}

export function getUserFromToken(token) {
  try {
    const payload = verifyToken(token);
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      provider: payload.provider
    };
  } catch (error) {
    logger.warn('Failed to extract user from token: %s', error.message);
    return null;
  }
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidDate(dateString) {
  return !!parseLocalDate(dateString);
}

export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}

export function providerSupportsPassword(provider) {
  return [USER_PROVIDERS.EMAIL, USER_PROVIDERS.GOOGLE_WITH_PASSWORD].includes(provider);
}

export function isOAuthProvider(provider) {
  return provider === USER_PROVIDERS.GOOGLE;
}

export function isDevelopmentProvider(provider) {
  return [USER_PROVIDERS.DEVELOPMENT, USER_PROVIDERS.FAKE, USER_PROVIDERS.LOCAL].includes(provider);
}

export function validateRegistrationData(userData) {
  const errors = [];
  const { name, email, password, birthDate, phone, provider = USER_PROVIDERS.EMAIL } = userData;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    errors.push('Name is required');
  } else if (name.length > VALIDATION_RULES.NAME_MAX_LENGTH) {
    errors.push(`Name must be less than ${VALIDATION_RULES.NAME_MAX_LENGTH} characters`);
  }

  if (!email || typeof email !== 'string') {
    errors.push('Email is required');
  } else if (!isValidEmail(email)) {
    errors.push('Invalid email format');
  } else if (email.length > VALIDATION_RULES.EMAIL_MAX_LENGTH) {
    errors.push(`Email must be less than ${VALIDATION_RULES.EMAIL_MAX_LENGTH} characters`);
  }

  if (provider === USER_PROVIDERS.EMAIL) {
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      errors.push(...passwordValidation.errors);
    }
  }

  if (phone && String(phone).length > VALIDATION_RULES.PHONE_MAX_LENGTH) {
    errors.push(`Phone must be less than ${VALIDATION_RULES.PHONE_MAX_LENGTH} characters`);
  }

  if (birthDate && !isValidDate(birthDate)) {
    errors.push('Invalid birth date format');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

export async function sendConfirmationEmail(user, language = 'en') {
  try {
    const confirmationToken = generateSpecialToken(user, TOKEN_TYPES.EMAIL_CONFIRMATION);
    await emailService.sendConfirmationEmail(user.email, user.name, confirmationToken, language);
    logger.info('Confirmation email sent to: %s', user.email);
    return true;
  } catch (error) {
    logger.error({ err: error, email: user.email }, 'Failed to send confirmation email');
    return false;
  }
}

export async function sendPasswordResetEmail(user, language = 'en') {
  try {
    const resetToken = generateSpecialToken(user, TOKEN_TYPES.PASSWORD_RESET);
    await emailService.sendPasswordResetEmail(user.email, user.name, resetToken, language);
    logger.info('Password reset email sent to: %s', user.email);
    return true;
  } catch (error) {
    logger.error({ err: error, email: user.email }, 'Failed to send password reset email');
    return false;
  }
}

export async function sendAccountDeletionEmail(user, language = 'en') {
  try {
    const deletionToken = generateSpecialToken(user, TOKEN_TYPES.ACCOUNT_DELETION);
    await emailService.sendAccountDeletionEmail(user.email, user.name, deletionToken, language);
    logger.info('Account deletion email sent to: %s', user.email);
    return true;
  } catch (error) {
    logger.error({ err: error, email: user.email }, 'Failed to send account deletion email');
    return false;
  }
}

export async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  try {
    return await userService.findByEmail(normalizedEmail);
  } catch (error) {
    logger.error({ err: error, email }, 'Failed to find user by email');
    return null;
  }
}

export async function createUser(userData) {
  const data = {
    ...userData,
    email: normalizeEmail(userData.email),
    provider: userData.provider || USER_PROVIDERS.EMAIL,
    language: userData.language || 'en'
  };

  const validation = validateRegistrationData(data);
  if (!validation.isValid) {
    throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
  }

  if (data.password) {
    data.password = await hashPassword(data.password);
  }

  data.emailVerified = data.emailVerified ?? (isOAuthProvider(data.provider) || isDevelopmentProvider(data.provider));
  data.accountStatus = data.accountStatus || 'active';
  data.lastLogin = new Date();

  const user = await userService.create(data);
  logger.info('User created successfully: %s', user.email);
  return user;
}

export async function updateLastLogin(user) {
  try {
    user.lastLogin = new Date();
    await userService.update(user);
  } catch (error) {
    logger.error({ err: error, email: user.email }, 'Failed to update last login');
  }
}

export function validateUserAccount(user) {
  if (!user) {
    return {
      isValid: false,
      reason: ERROR_CODES.USER_NOT_FOUND,
      message: 'User not found'
    };
  }

  if (user.accountStatus && user.accountStatus !== 'active') {
    return {
      isValid: false,
      reason: ERROR_CODES.ACCOUNT_SUSPENDED,
      message: 'Account is suspended'
    };
  }

  if (!user.emailVerified) {
    return {
      isValid: false,
      reason: ERROR_CODES.EMAIL_NOT_VERIFIED,
      message: 'Email not verified'
    };
  }

  return {
    isValid: true,
    reason: null,
    message: 'Account is valid'
  };
}

export function getFrontendUrl() {
  if (process.env.NODE_ENV === 'development') {
    return process.env.FRONTEND_URL || 'http://10.0.2.2:8100';
  }
  return process.env.FRONTEND_ONLINE_URL || process.env.FRONTEND_URL || 'http://localhost:8100';
}

export function sanitizeUserData(user) {
  if (!user) {
    return null;
  }

  const source = user.toObject ? user.toObject() : { ...user };
  const {
    password,
    googleAccessToken,
    googleRefreshToken,
    googleTokenExpiry,
    __v,
    ...safeUser
  } = source;

  return {
    ...safeUser,
    id: safeUser._id?.toString() || safeUser.id
  };
}

export function generateRandomString(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function isDevelopmentMode() {
  return process.env.NODE_ENV !== 'production';
}

export default {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateAuthToken,
  generateSpecialToken,
  verifyToken,
  getUserFromToken,
  validateRegistrationData,
  isValidEmail,
  isValidDate,
  normalizeEmail,
  providerSupportsPassword,
  isOAuthProvider,
  isDevelopmentProvider,
  sendConfirmationEmail,
  sendPasswordResetEmail,
  sendAccountDeletionEmail,
  findUserByEmail,
  createUser,
  updateLastLogin,
  validateUserAccount,
  getFrontendUrl,
  sanitizeUserData,
  generateRandomString,
  isDevelopmentMode
};
