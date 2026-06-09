import { verifyJWT } from '../config/passport.js';
import logger from '../config/logger.js';
import * as userService from '../services/userService.js';

const isDevBypassEnabled = () =>
  process.env.NODE_ENV === 'development' && process.env.ENABLE_DEV_BYPASS === 'true';

const getOrCreateDevUser = async () => {
  const email = 'dev@dev.com';
  let user = await userService.findByEmail(email);
  if (user) return user;

  return userService.create({
    name: 'Dev User',
    email,
    provider: 'development',
    emailVerified: true,
    isDevelopment: true,
    accountStatus: 'active'
  });
};

export const validateJWTToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'No authorization token provided'
      });
    }

    const token = authHeader.substring(7);
    if (isDevBypassEnabled() && token === 'fake-token') {
      req.user = await getOrCreateDevUser();
      return next();
    }

    const decoded = verifyJWT(token);
    const user = await userService.findByEmail(decoded.email);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'User not found'
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    logger.error({ err: error }, 'JWT authentication failed');
    return res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid or expired token'
    });
  }
};
