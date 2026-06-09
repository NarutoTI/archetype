import { body, validationResult } from 'express-validator';
import { ObjectId } from 'mongodb';

const errorCodeMap = {
  'Email must have a valid format': 'INVALID_EMAIL_FORMAT',
  'Password must have at least 6 characters': 'INVALID_PASSWORD',
  'Password must be less than 128 characters': 'INVALID_PASSWORD',
  'Name must be between 2 and 100 characters': 'INVALID_NAME',
  'Password is required': 'PASSWORD_REQUIRED',
  'Token is required': 'TOKEN_REQUIRED',
  'Email is required': 'EMAIL_REQUIRED',
  'Phone must be in international format': 'INVALID_PHONE_FORMAT',
  'Birth date must be YYYY-MM-DD, after 1900-01-01, and not in the future': 'INVALID_BIRTH_DATE',
  'ID must be a valid Mongo ID': 'INVALID_ID_FORMAT'
};

const isDevelopmentEnv = (process.env.NODE_ENV || 'development') === 'development';

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

export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (errors.isEmpty()) {
    return next();
  }

  const formattedErrors = errors.array().map((error) => ({
    field: error.path,
    message: error.msg,
    code: errorCodeMap[error.msg] || 'VALIDATION_ERROR',
    value: error.value
  }));

  if (formattedErrors.length === 1) {
    return res.status(422).json({
      success: false,
      code: formattedErrors[0].code,
      message: formattedErrors[0].message,
      field: formattedErrors[0].field
    });
  }

  return res.status(422).json({
    success: false,
    code: 'VALIDATION_ERROR',
    message: 'Multiple validation errors',
    errors: formattedErrors
  });
};

export const emailValidation = isDevelopmentEnv
  ? body('email').isEmail().withMessage('Email must have a valid format')
  : body('email').isEmail().normalizeEmail().withMessage('Email must have a valid format');

export const passwordValidation = body('password')
  .isLength({ min: 6 })
  .withMessage('Password must have at least 6 characters')
  .isLength({ max: 128 })
  .withMessage('Password must be less than 128 characters');

export const nameValidation = body('name')
  .trim()
  .isLength({ min: 2, max: 100 })
  .withMessage('Name must be between 2 and 100 characters');

export const phoneValidation = body('phone')
  .optional({ nullable: true, checkFalsy: true })
  .custom((value) => {
    const cleanPhone = String(value).replace(/[\s().-]/g, '');
    if (!/^\+[1-9]\d{7,16}$/.test(cleanPhone)) {
      throw new Error('Phone must be in international format');
    }
    return true;
  });

export const birthDateValidation = body('birthDate')
  .optional({ nullable: true, checkFalsy: true })
  .custom((value) => {
    const birthDate = parseLocalDate(value);
    const minDate = new Date(1900, 0, 1);
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (!birthDate || birthDate < minDate || birthDate > todayLocal) {
      throw new Error('Birth date must be YYYY-MM-DD, after 1900-01-01, and not in the future');
    }
    return true;
  });

export const mongoIdValidation = (field = 'id') =>
  body(field).custom((value) => {
    if (!ObjectId.isValid(value)) {
      throw new Error('ID must be a valid Mongo ID');
    }
    return true;
  });

export const validateRegister = [
  nameValidation,
  emailValidation,
  passwordValidation,
  phoneValidation,
  birthDateValidation,
  handleValidationErrors
];

export const validateLogin = [
  emailValidation,
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors
];

export const validateForgotPassword = [
  emailValidation,
  handleValidationErrors
];

export const validateResetPassword = [
  body('token').notEmpty().withMessage('Token is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('Password must have at least 6 characters')
    .isLength({ max: 128 })
    .withMessage('Password must be less than 128 characters'),
  handleValidationErrors
];

export const validateResendConfirmation = [
  emailValidation,
  handleValidationErrors
];

export const validateUserProfileUpdate = [
  body('name')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  phoneValidation,
  birthDateValidation,
  handleValidationErrors
];
