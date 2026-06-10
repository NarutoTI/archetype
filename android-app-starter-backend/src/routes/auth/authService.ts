import bcrypt from 'bcrypt';
import type { SignOptions } from 'jsonwebtoken';
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
import type { AppUser, AppUserInput, JwtUserPayload, SafeUser } from '../../types/schemas.js';
import type { TokenType } from './authConsts.js';

interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
}

interface AccountValidationResult {
  isValid: boolean;
  reason: string | null;
  message: string;
}

type RegistrationData = AppUserInput & {
  password?: string | null;
  language?: string;
  emailVerified?: boolean;
  isDevelopment?: boolean;
  picture?: string | null;
};

type TokenUserData = {
  id?: string;
  email: string;
  name?: string;
  provider?: string;
};

const getErrorMessage = (error: unknown): string => (
  error instanceof Error ? error.message : String(error)
);

const getErrorName = (error: unknown): string => (
  error instanceof Error ? error.name : ''
);

const getTokenExpiry = (tokenType: string): SignOptions['expiresIn'] => {
  const key = tokenType.toUpperCase() as keyof typeof TOKEN_EXPIRY;
  return TOKEN_EXPIRY[key] || TOKEN_EXPIRY.AUTH;
};

const parseLocalDate = (value: unknown): Date | null => {
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

export async function hashPassword(plainPassword: string): Promise<string> {
  if (!plainPassword) {
    throw new Error('Password is required for hashing');
  }
  return bcrypt.hash(plainPassword, VALIDATION_RULES.BCRYPT_SALT_ROUNDS);
}

export async function comparePassword(
  plainPassword: string | null | undefined,
  hashedPassword: string | null | undefined
): Promise<boolean> {
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

export function validatePasswordStrength(password: string | null | undefined): PasswordValidationResult {
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

export function generateAuthToken(user: AppUser, tokenType: TokenType = TOKEN_TYPES.AUTH): string {
  const expiresIn = getTokenExpiry(tokenType);
  return generateJWT({
    id: user._id?.toString() || user.id,
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider,
    tokenType
  }, expiresIn);
}

export function generateSpecialToken(user: AppUser, tokenType: TokenType): string {
  const expiresIn = getTokenExpiry(tokenType);
  return generateJWT({
    id: user._id?.toString() || user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    tokenType
  }, expiresIn);
}

export function verifyToken(token: string): JwtUserPayload {
  if (!token) {
    throw new Error(ERROR_CODES.MISSING_TOKEN);
  }

  try {
    return verifyJWT(token);
  } catch (error) {
    logger.warn('Token verification failed: %s', getErrorMessage(error));
    if (getErrorName(error) === 'TokenExpiredError') {
      throw new Error(ERROR_CODES.TOKEN_EXPIRED);
    }
    throw new Error(ERROR_CODES.INVALID_TOKEN);
  }
}

export function getUserFromToken(token: string): TokenUserData | null {
  try {
    const payload = verifyToken(token);
    return {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      provider: payload.provider
    };
  } catch (error) {
    logger.warn('Failed to extract user from token: %s', getErrorMessage(error));
    return null;
  }
}

export function isValidEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidDate(dateString: unknown): boolean {
  return !!parseLocalDate(dateString);
}

export function normalizeEmail(email: unknown): string {
  if (!email || typeof email !== 'string') {
    return '';
  }
  return email.trim().toLowerCase();
}

export function providerSupportsPassword(provider: string): boolean {
  const providers: readonly string[] = [USER_PROVIDERS.EMAIL, USER_PROVIDERS.GOOGLE_WITH_PASSWORD];
  return providers.includes(provider);
}

export function isOAuthProvider(provider: string): boolean {
  return provider === USER_PROVIDERS.GOOGLE;
}

export function isDevelopmentProvider(provider: string): boolean {
  const providers: readonly string[] = [USER_PROVIDERS.DEVELOPMENT, USER_PROVIDERS.FAKE, USER_PROVIDERS.LOCAL];
  return providers.includes(provider);
}

export function validateRegistrationData(userData: Partial<RegistrationData>): PasswordValidationResult {
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

export async function sendConfirmationEmail(user: AppUser, language = 'en'): Promise<boolean> {
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

export async function sendPasswordResetEmail(user: AppUser, language = 'en'): Promise<boolean> {
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

export async function sendAccountDeletionEmail(user: AppUser, language = 'en'): Promise<boolean> {
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

export async function findUserByEmail(email: string): Promise<AppUser | null> {
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

export async function createUser(userData: RegistrationData): Promise<AppUser> {
  const data: RegistrationData & { accountStatus?: string; lastLogin?: Date } = {
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

  const provider = data.provider || USER_PROVIDERS.EMAIL;
  data.provider = provider;
  data.emailVerified = data.emailVerified ?? (isOAuthProvider(provider) || isDevelopmentProvider(provider));
  data.accountStatus = data.accountStatus || 'active';
  data.lastLogin = new Date();

  const user = await userService.create(data);
  logger.info('User created successfully: %s', user.email);
  return user;
}

export async function updateLastLogin(user: AppUser): Promise<void> {
  try {
    user.lastLogin = new Date();
    await userService.update(user);
  } catch (error) {
    logger.error({ err: error, email: user.email }, 'Failed to update last login');
  }
}

export function validateUserAccount(user: AppUser | null): AccountValidationResult {
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
    return process.env.FRONTEND_URL || 'http://localhost:8101';
  }
  return process.env.FRONTEND_ONLINE_URL || process.env.FRONTEND_URL || 'http://localhost:8101';
}

export function sanitizeUserData(user: AppUser | null): SafeUser | null {
  if (!user) {
    return null;
  }

  const {
    password,
    googleAccessToken,
    googleRefreshToken,
    googleTokenExpiry,
    __v,
    ...safeUser
  } = user;

  return {
    ...safeUser,
    id: safeUser._id?.toString() || safeUser.id
  };
}

export function generateRandomString(length = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function isDevelopmentMode(): boolean {
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
