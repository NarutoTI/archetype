import passport, { isGoogleOAuthEnabled } from '../../config/passport.js';
import * as userService from '../../services/userService.js';
import logger from '../../config/logger.js';
import {
  USER_PROVIDERS,
  TOKEN_TYPES,
  AUTH_ACTIONS,
  ERROR_CODES,
  HTTP_STATUS,
  SUCCESS_MESSAGES
} from './authConsts.js';
import authService from './authService.js';
import { sendError, sendSuccess } from '../../utils/errorHandler.js';

function getFrontendUrl() {
  if (process.env.NODE_ENV === 'development') {
    return process.env.FRONTEND_URL || 'http://10.0.2.2:8100';
  }
  return process.env.FRONTEND_ONLINE_URL || process.env.FRONTEND_URL || 'http://localhost:8100';
}

function getMobileDeepLinkScheme() {
  return process.env.MOBILE_DEEP_LINK_SCHEME || 'androidstarter';
}

function isMobileAppRequest(req) {
  const { state } = req.query || {};
  const isMobileState = typeof state === 'string' && state.startsWith('mobile:');
  const userAgent = req.get('User-Agent') || '';

  return req.query.mobile === 'true' ||
    isMobileState ||
    userAgent.includes('AndroidAppStarter');
}

function generateRedirectUrl(req, token = null, success = true, error = null) {
  if (isMobileAppRequest(req)) {
    const scheme = getMobileDeepLinkScheme();
    if (error) {
      return `${scheme}://auth?error=${encodeURIComponent(error)}`;
    }

    const params = new URLSearchParams({ success: String(success) });
    if (token) {
      params.set('token', token);
    }
    return `${scheme}://auth?${params.toString()}`;
  }

  const frontendUrl = getFrontendUrl();
  if (error) {
    return `${frontendUrl}/login?error=${encodeURIComponent(error)}`;
  }

  const params = new URLSearchParams({ success: String(success) });
  if (token) {
    params.set('token', token);
  }
  return `${frontendUrl}/auth/callback?${params.toString()}`;
}

export async function register(req, res) {
  try {
    const { name, email, password, birthDate, phone, language = 'en' } = req.body;
    const normalizedEmail = authService.normalizeEmail(email);

    const existingUser = await authService.findUserByEmail(normalizedEmail);
    if (existingUser) {
      return sendError(
        res,
        HTTP_STATUS.CONFLICT,
        ERROR_CODES.USER_ALREADY_EXISTS,
        'User with this email already exists'
      );
    }

    const user = await authService.createUser({
      name: name.trim(),
      email: normalizedEmail,
      password,
      birthDate: birthDate?.trim(),
      phone: phone?.trim(),
      provider: USER_PROVIDERS.EMAIL,
      language: language || 'en'
    });

    const emailSent = await authService.sendConfirmationEmail(user, language);
    if (!emailSent) {
      logger.warn('Failed to send confirmation email to: %s', user.email);
    }

    return sendSuccess(res, HTTP_STATUS.CREATED, 'USER_REGISTERED', SUCCESS_MESSAGES.REGISTRATION_SUCCESS, {
      user: authService.sanitizeUserData(user)
    });
  } catch (error) {
    logger.error({ err: error }, 'Registration error');
    return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Registration failed');
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;
    const user = await authService.findUserByEmail(email);

    if (!user?.password) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const passwordValid = await authService.comparePassword(password, user.password);
    if (!passwordValid) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password');
    }

    const accountValidation = authService.validateUserAccount(user);
    if (!accountValidation.isValid) {
      const status = accountValidation.reason === ERROR_CODES.EMAIL_NOT_VERIFIED
        ? HTTP_STATUS.FORBIDDEN
        : HTTP_STATUS.UNAUTHORIZED;
      return sendError(res, status, accountValidation.reason, accountValidation.message);
    }

    await authService.updateLastLogin(user);

    return res.json({
      success: true,
      token: authService.generateAuthToken(user),
      user: authService.sanitizeUserData(user),
      message: SUCCESS_MESSAGES.LOGIN_SUCCESS
    });
  } catch (error) {
    logger.error({ err: error }, 'Login error');
    return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Login failed');
  }
}

export async function forgotPassword(req, res) {
  try {
    const { email, language = 'en' } = req.body;
    const user = await authService.findUserByEmail(email);

    if (user) {
      const emailSent = await authService.sendPasswordResetEmail(user, language);
      if (!emailSent) {
        logger.warn('Failed to send password reset email to: %s', user.email);
      }
    } else {
      logger.info('Password reset requested for unknown email: %s', email);
    }

    return sendSuccess(
      res,
      HTTP_STATUS.OK,
      'PASSWORD_RESET_EMAIL_SENT',
      SUCCESS_MESSAGES.PASSWORD_RESET_EMAIL_SENT
    );
  } catch (error) {
    logger.error({ err: error }, 'Forgot password error');
    return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Internal server error');
  }
}

export async function resetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;
    const payload = authService.verifyToken(token);

    if (payload.tokenType !== TOKEN_TYPES.PASSWORD_RESET) {
      return sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_RESET_TOKEN, 'Invalid reset token type');
    }

    const user = await authService.findUserByEmail(payload.email);
    if (!user) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }

    if (!user.password && user.provider !== USER_PROVIDERS.EMAIL) {
      user.provider = USER_PROVIDERS.GOOGLE_WITH_PASSWORD;
      user.emailVerified = true;
    }

    user.password = await authService.hashPassword(newPassword);
    await userService.update(user);

    return sendSuccess(res, HTTP_STATUS.OK, 'PASSWORD_RESET_SUCCESS', SUCCESS_MESSAGES.PASSWORD_RESET_SUCCESS);
  } catch (error) {
    logger.error({ err: error }, 'Reset password error');
    return sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_RESET_TOKEN, 'Invalid or expired reset token');
  }
}

export async function initGoogleAuth(req, res, next) {
  try {
    const googleEnabled = await isGoogleOAuthEnabled();
    if (!googleEnabled) {
      return res.redirect(generateRedirectUrl(req, null, false, 'oauth_not_configured'));
    }

    const language = req.query.language || 'en';
    const platform = req.query.mobile === 'true' ? 'mobile' : 'web';
    const state = `${platform}:1:${language}`;

    return passport.authenticate('google', {
      scope: ['profile', 'email'],
      state
    })(req, res, next);
  } catch (error) {
    logger.error({ err: error }, 'Google OAuth initialization error');
    return res.redirect(generateRedirectUrl(req, null, false, 'oauth_failed'));
  }
}

export async function handleGoogleCallback(req, res) {
  try {
    let language = 'en';
    if (typeof req.query.state === 'string') {
      const stateParts = req.query.state.split(':');
      if (stateParts.length >= 3) {
        language = stateParts[2];
      }
    }

    passport.authenticate('google', { session: false }, async (err, googleUser) => {
      if (err || !googleUser) {
        logger.error({ err }, 'Google OAuth authentication failed');
        return res.redirect(generateRedirectUrl(req, null, false, 'oauth_failed'));
      }

      try {
        let user = await authService.findUserByEmail(googleUser.email);

        if (!user) {
          user = await authService.createUser({
            name: googleUser.name,
            email: googleUser.email,
            provider: USER_PROVIDERS.GOOGLE,
            picture: googleUser.picture,
            emailVerified: true,
            language
          });
        } else {
          user.name = googleUser.name || user.name;
          user.picture = googleUser.picture || user.picture;
          user.emailVerified = true;
          await authService.updateLastLogin(user);
        }

        const authToken = authService.generateAuthToken(user);
        return res.redirect(generateRedirectUrl(req, authToken, true));
      } catch (error) {
        logger.error({ err: error }, 'Google callback processing error');
        return res.redirect(generateRedirectUrl(req, null, false, 'callback_failed'));
      }
    })(req, res);
  } catch (error) {
    logger.error({ err: error }, 'Google OAuth callback error');
    return res.redirect(generateRedirectUrl(req, null, false, 'callback_failed'));
  }
}

export async function processToken(req, res) {
  try {
    const { token } = req.body;
    const payload = authService.verifyToken(token);

    switch (payload.tokenType) {
      case TOKEN_TYPES.EMAIL_CONFIRMATION:
        return processEmailConfirmationToken(res, payload);
      case TOKEN_TYPES.PASSWORD_RESET:
        return processPasswordResetToken(res, payload);
      case TOKEN_TYPES.ACCOUNT_DELETION:
        return processAccountDeletionToken(res, payload);
      default:
        return processAuthToken(res, payload);
    }
  } catch (error) {
    logger.error({ err: error }, 'Token processing error');
    return sendError(res, HTTP_STATUS.BAD_REQUEST, ERROR_CODES.INVALID_TOKEN, 'Invalid or expired token');
  }
}

async function processEmailConfirmationToken(res, payload) {
  const user = await authService.findUserByEmail(payload.email);
  if (!user) {
    return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  if (user.emailVerified) {
    return res.json({
      success: true,
      message: 'Email already verified',
      action: AUTH_ACTIONS.EMAIL_ALREADY_VERIFIED
    });
  }

  user.emailVerified = true;
  await userService.update(user);

  return res.json({
    success: true,
    token: authService.generateAuthToken(user),
    user: authService.sanitizeUserData(user),
    message: SUCCESS_MESSAGES.EMAIL_CONFIRMED,
    action: AUTH_ACTIONS.EMAIL_CONFIRMED
  });
}

async function processPasswordResetToken(res, payload) {
  const user = await authService.findUserByEmail(payload.email);
  if (!user) {
    return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  return res.json({
    success: true,
    message: 'Password reset token verified',
    action: AUTH_ACTIONS.PASSWORD_RESET_READY
  });
}

async function processAccountDeletionToken(res, payload) {
  const user = await authService.findUserByEmail(payload.email);
  if (!user) {
    return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  await userService.deleteUser(user._id);

  return res.json({
    success: true,
    message: SUCCESS_MESSAGES.ACCOUNT_DELETED,
    action: AUTH_ACTIONS.ACCOUNT_DELETED
  });
}

async function processAuthToken(res, payload) {
  const user = await authService.findUserByEmail(payload.email);
  if (!user) {
    return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
  }

  await authService.updateLastLogin(user);

  return res.json({
    success: true,
    token: authService.generateAuthToken(user),
    user: authService.sanitizeUserData(user),
    message: SUCCESS_MESSAGES.LOGIN_SUCCESS,
    action: AUTH_ACTIONS.AUTH_TOKEN
  });
}

export async function requestAccountDeletion(req, res) {
  try {
    const { language = 'en', token } = req.body;
    const payload = authService.verifyToken(token);
    const user = await authService.findUserByEmail(payload.email);

    if (!user) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }

    const emailSent = await authService.sendAccountDeletionEmail(user, language);
    if (!emailSent) {
      return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.EMAIL_SEND_FAILED, 'Failed to send deletion email');
    }

    return res.json({
      success: true,
      message: SUCCESS_MESSAGES.ACCOUNT_DELETION_EMAIL_SENT
    });
  } catch (error) {
    logger.error({ err: error }, 'Account deletion request error');
    return sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_TOKEN, 'Invalid or expired token');
  }
}

export async function resendConfirmation(req, res) {
  try {
    const { email, language = 'en' } = req.body;
    const user = await authService.findUserByEmail(email);

    if (!user || user.emailVerified) {
      return sendSuccess(res, HTTP_STATUS.OK, 'CONFIRMATION_EMAIL_SENT', SUCCESS_MESSAGES.CONFIRMATION_EMAIL_SENT);
    }

    await authService.sendConfirmationEmail(user, language);
    return sendSuccess(res, HTTP_STATUS.OK, 'CONFIRMATION_EMAIL_SENT', SUCCESS_MESSAGES.CONFIRMATION_EMAIL_SENT);
  } catch (error) {
    logger.error({ err: error }, 'Resend confirmation error');
    return sendError(
      res,
      HTTP_STATUS.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_SERVER_ERROR,
      'Failed to resend confirmation email'
    );
  }
}

export async function handleFakeLogin(req, res) {
  try {
    if (!authService.isDevelopmentMode()) {
      return sendError(res, HTTP_STATUS.FORBIDDEN, ERROR_CODES.ACCESS_DENIED, 'Fake login only available outside production');
    }

    const { email = 'dev@dev.com', name = 'Dev User' } = req.body;
    let user = await authService.findUserByEmail(email);

    if (!user) {
      user = await authService.createUser({
        name,
        email,
        provider: USER_PROVIDERS.FAKE,
        emailVerified: true,
        isDevelopment: true,
        language: 'en'
      });
    } else {
      await authService.updateLastLogin(user);
    }

    return res.json({
      success: true,
      token: authService.generateAuthToken(user),
      user: authService.sanitizeUserData(user),
      message: 'Fake login successful'
    });
  } catch (error) {
    logger.error({ err: error }, 'Fake login error');
    return sendError(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, ERROR_CODES.INTERNAL_SERVER_ERROR, 'Fake login failed');
  }
}

export async function handleLogout(_req, res) {
  return res.json({
    success: true,
    message: SUCCESS_MESSAGES.LOGOUT_SUCCESS
  });
}

export async function verifyToken(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.MISSING_TOKEN, 'No authorization token provided');
    }

    const payload = authService.verifyToken(authHeader.substring(7));
    const user = await authService.findUserByEmail(payload.email);
    if (!user) {
      return sendError(res, HTTP_STATUS.NOT_FOUND, ERROR_CODES.USER_NOT_FOUND, 'User not found');
    }

    const accountValidation = authService.validateUserAccount(user);
    if (!accountValidation.isValid) {
      return sendError(res, HTTP_STATUS.UNAUTHORIZED, accountValidation.reason, accountValidation.message);
    }

    return res.json({
      success: true,
      user: authService.sanitizeUserData(user),
      message: 'Token is valid'
    });
  } catch (error) {
    logger.error({ err: error }, 'Token verification error');
    return sendError(res, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.INVALID_TOKEN, 'Invalid or expired token');
  }
}
