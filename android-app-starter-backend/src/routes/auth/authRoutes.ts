import express from 'express';
import type { Request, Response } from 'express';
import { body } from 'express-validator';
import {
  register,
  login,
  forgotPassword,
  resetPassword,
  initGoogleAuth,
  handleGoogleCallback,
  processToken,
  verifyToken,
  requestAccountDeletion,
  resendConfirmation,
  handleLogout,
  handleFakeLogin
} from './authController.js';
import {
  handleValidationErrors,
  emailValidation,
  validateLogin,
  validateRegister,
  validateForgotPassword
} from '../../middlewares/validation.js';
import { loginRateLimit, sensitiveRateLimit } from '../../middlewares/rateLimitMiddleware.js';
import { VALIDATION_RULES, HTTP_STATUS } from './authConsts.js';
import { supportedEmailTemplateLanguages } from '../../services/emailTemplates.js';

const router = express.Router();
const supportedLanguagesMessage = `Language must be one of: ${supportedEmailTemplateLanguages.join(', ')}`;

const validatePasswordReset = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('newPassword')
    .isLength({ min: VALIDATION_RULES.PASSWORD_MIN_LENGTH })
    .withMessage(`Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters long`)
    .isLength({ max: VALIDATION_RULES.PASSWORD_MAX_LENGTH })
    .withMessage(`Password must be less than ${VALIDATION_RULES.PASSWORD_MAX_LENGTH} characters long`),
  handleValidationErrors
];

const validateTokenProcessing = [
  body('token').notEmpty().withMessage('Token is required'),
  handleValidationErrors
];

const validateEmailResend = [
  emailValidation,
  body('language').optional().isIn(supportedEmailTemplateLanguages).withMessage(supportedLanguagesMessage),
  handleValidationErrors
];

const validateAccountDeletionRequest = [
  body('token').notEmpty().withMessage('Authentication token is required'),
  body('language').optional().isIn(supportedEmailTemplateLanguages).withMessage(supportedLanguagesMessage),
  handleValidationErrors
];

const validateFakeLogin = [
  body('email').optional().isEmail().withMessage('Must be a valid email address'),
  body('name')
    .optional()
    .isLength({ min: 1, max: VALIDATION_RULES.NAME_MAX_LENGTH })
    .withMessage(`Name must be between 1 and ${VALIDATION_RULES.NAME_MAX_LENGTH} characters`),
  handleValidationErrors
];

router.post('/register', validateRegister, register);
router.post('/login', loginRateLimit, validateLogin, login);
router.post('/forgot-password', sensitiveRateLimit, validateForgotPassword, forgotPassword);
router.post('/reset-password', sensitiveRateLimit, validatePasswordReset, resetPassword);

router.get('/google', initGoogleAuth);
router.get('/google/callback', handleGoogleCallback);

router.post('/process-token', validateTokenProcessing, processToken);
router.get('/verify', verifyToken);

router.post('/delete-account-request', validateAccountDeletionRequest, requestAccountDeletion);
router.post('/resend-confirmation', validateEmailResend, resendConfirmation);
router.post('/logout', handleLogout);
router.post('/fake-login', validateFakeLogin, handleFakeLogin);

router.get('/routes', (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Route documentation not available in production'
    });
  }

  return res.json({
    success: true,
    routes: [
      { method: 'POST', path: '/auth/register', body: ['name', 'email', 'password', '?birthDate', '?phone', '?language'] },
      { method: 'POST', path: '/auth/login', body: ['email', 'password'] },
      { method: 'POST', path: '/auth/forgot-password', body: ['email', '?language'] },
      { method: 'POST', path: '/auth/reset-password', body: ['token', 'newPassword'] },
      { method: 'GET', path: '/auth/google', query: ['?mobile=true', '?language'] },
      { method: 'POST', path: '/auth/process-token', body: ['token'] },
      { method: 'GET', path: '/auth/verify', headers: ['Authorization: Bearer <token>'] },
      { method: 'POST', path: '/auth/delete-account-request', body: ['token', '?language'] },
      { method: 'POST', path: '/auth/resend-confirmation', body: ['email', '?language'] },
      { method: 'POST', path: '/auth/logout', body: [] },
      { method: 'POST', path: '/auth/fake-login', body: ['?email', '?name'] }
    ]
  });
});

export default router;
