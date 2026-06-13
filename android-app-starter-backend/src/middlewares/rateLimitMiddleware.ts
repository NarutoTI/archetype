import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';
import logger from '../config/logger.js';

// Função simples para mascarar email em logs.
const maskEmail = (s = ''): string => s.replace(/(.).+(@.+)/, '$1***$2');

const getClientIp = (req: Request): string => req.ip || req.socket.remoteAddress || '0.0.0.0';

/**
 * Ignora preflight, health e HEAD.
 */
const shouldSkip = (req: Request): boolean => {
  if (req.method === 'OPTIONS' || req.method === 'HEAD') return true;
  const p = req.path;
  return p === '/health' || p === '/api/health';
};

/**
 * 1) Limitador geral da API.
 * - janela curta para suavizar picos: 10s;
 * - cerca de 8 req/s => 80/10s.
 */
export const generalRateLimit = rateLimit({
  windowMs: 10 * 1000,
  limit: 80,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  // Usa máscara /56 para IPv6 e reduz tentativas de bypass por variação de IP.
  keyGenerator: (req) => ipKeyGenerator(getClientIp(req), 56),
  handler: (req, res) => {
    const ip = ipKeyGenerator(getClientIp(req), 56);
    const ua = req.headers['user-agent'];
    logger.warn('[RATE_LIMIT][GENERAL] ip=%s path=%s ua=%s', ip, req.path, ua);

    res.status(429).json({
      success: false,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      retryAfterSeconds:
        Math.max(1, Math.ceil(((req.rateLimit?.resetTime?.getTime() || Date.now()) - Date.now()) / 1000)) || 10,
      rateLimit: {
        limit: req.rateLimit?.limit,
        remaining: req.rateLimit?.remaining,
        windowMs: 10_000
      }
    });
  }
});

/**
 * 2) Limitador de login.
 * - mais restritivo: 10/60s;
 * - chave por IP + email para reduzir abuso em IP compartilhado.
 */
export const loginRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  requestWasSuccessful: (req, res) => {
    return res.statusCode < 400;
  },
  keyGenerator: (req) => {
    // Mantém compatibilidade IPv6 com máscara /56.
    const ip = ipKeyGenerator(getClientIp(req), 56);
    // Usa email ou username quando o payload tiver esse identificador.
    const userId = (req.body?.email || req.body?.username || '').toLowerCase().trim();
    return userId ? `${ip}:${userId}` : ip;
  },
  handler: (req, res) => {
    const ip = ipKeyGenerator(getClientIp(req), 56);
    const ua = req.headers['user-agent'];
    const email = (req.body?.email || req.body?.username || '').toLowerCase().trim();
    const masked = email ? maskEmail(email) : '';
    logger.warn('[RATE_LIMIT][LOGIN] ip=%s path=%s ua=%s user=%s', ip, req.path, ua, masked);

    res.status(429).json({
      success: false,
      error: 'LOGIN_RATE_LIMIT_EXCEEDED',
      message: 'Too many login attempts. Please try again later.',
      retryAfterSeconds:
        Math.max(1, Math.ceil(((req.rateLimit?.resetTime?.getTime() || Date.now()) - Date.now()) / 1000)) || 10,
      rateLimit: {
        limit: req.rateLimit?.limit,
        remaining: req.rateLimit?.remaining,
        windowMs: 60_000
      }
    });
  }
});

/**
 * 3) Limitador de operações sensíveis.
 * - bem restritivo: 2/min por IP;
 * - se necessário, combine com chave de usuário.
 */
export const sensitiveRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 2,
  standardHeaders: true,
  legacyHeaders: false,
  skip: shouldSkip,
  // Mantém compatibilidade IPv6 com máscara /56.
  keyGenerator: (req) => ipKeyGenerator(getClientIp(req), 56),
  handler: (req, res) => {
    const ip = ipKeyGenerator(getClientIp(req), 56);
    const ua = req.headers['user-agent'];
    logger.warn('[RATE_LIMIT][SENSITIVE] ip=%s path=%s ua=%s', ip, req.path, ua);

    res.status(429).json({
      success: false,
      error: 'SENSITIVE_RATE_LIMIT_EXCEEDED',
      message: 'Too many sensitive operations. Please try again later.',
      retryAfterSeconds:
        Math.max(1, Math.ceil(((req.rateLimit?.resetTime?.getTime() || Date.now()) - Date.now()) / 1000)) || 30,
      rateLimit: {
        limit: req.rateLimit?.limit,
        remaining: req.rateLimit?.remaining,
        windowMs: 60_000
      }
    });
  }
});
