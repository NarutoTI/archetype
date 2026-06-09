import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import logger from '../config/logger.js';

// helper simples para mascarar email em logs
const maskEmail = (s = '') => s.replace(/(.).+(@.+)/, '$1***$2');

/**
 * Helper: ignora preflight/health e HEAD.
 */
const shouldSkip = (req) => {
  if (req.method === 'OPTIONS' || req.method === 'HEAD') return true;
  const p = req.path;
  return p === '/health' || p === '/api/health';
};

/**
 * 1) General API limiter
 * - lower window to smooth spikes: 10s
 * - ~8 req/s => 80/10s
 */
export const generalRateLimit = rateLimit({
  windowMs: 10 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  // Use ipKeyGenerator helper for proper IPv6 handling
  // Applies /56 subnet mask for IPv6 addresses to prevent bypass attempts
  keyGenerator: (req, _res) => ipKeyGenerator(req.ip, 56),
  handler: (req, res) => {
    const ip = ipKeyGenerator(req.ip, 56);
    const ua = req.headers['user-agent'];
    logger.warn('[RATE_LIMIT][GENERAL] ip=%s path=%s ua=%s', ip, req.path, ua);

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      retryAfterSeconds:
        Math.max(1, Math.ceil((req.rateLimit.resetTime?.getTime() - Date.now()) / 1000)) || 10,
      rateLimit: {
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        windowMs: 10_000
      }
    });
  }
});

/**
 * 2) Login limiter
 * - more restrictive (ex.: 10/60s ≈ 1 req/s)
 * - key by IP + email to avoid spray by shared IP
 */
export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  requestWasSuccessful: (req, res) => {
    return res.statusCode < 400;
  },
  keyGenerator: (req) => {
    // Use helper for IPv6 compatibility with /56 subnet mask
    const ip = ipKeyGenerator(req.ip, 56);
    // Adjust according to your payload (req.body.email, req.body.username, etc.)
    const userId = (req.body?.email || req.body?.username || '').toLowerCase().trim();
    return userId ? `${ip}:${userId}` : ip;
  },
  handler: (req, res) => {
    const ip = ipKeyGenerator(req.ip, 56);
    const ua = req.headers['user-agent'];
    const email = (req.body?.email || req.body?.username || '').toLowerCase().trim();
    const masked = email ? maskEmail(email) : '';
    logger.warn('[RATE_LIMIT][LOGIN] ip=%s path=%s ua=%s user=%s', ip, req.path, ua, masked);

    res.status(429).json({
      success: false,
      error: 'LOGIN_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
      retryAfterSeconds:
        Math.max(1, Math.ceil((req.rateLimit.resetTime?.getTime() - Date.now()) / 1000)) || 10,
      rateLimit: {
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        windowMs: 60_000
      }
    });
  }
});

/**
 * 3) Sensitive limiter (password reset, 2FA, etc.)
 * - Very restrictive: 2/min by IP
 * - If needed, combine with user key
 */
export const sensitiveRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 2,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  // Use helper for IPv6 compatibility with /56 subnet mask
  keyGenerator: (req) => ipKeyGenerator(req.ip, 56),
  handler: (req, res) => {
    const ip = ipKeyGenerator(req.ip, 56);
    const ua = req.headers['user-agent'];
    logger.warn('[RATE_LIMIT][SENSITIVE] ip=%s path=%s ua=%s', ip, req.path, ua);

    res.status(429).json({
      success: false,
      error: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
      message: 'Too many sensitive operations. Please try again later.',
      retryAfterSeconds:
        Math.max(1, Math.ceil((req.rateLimit.resetTime?.getTime() - Date.now()) / 1000)) || 30,
      rateLimit: {
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        windowMs: 60_000
      }
    });
  }
});
