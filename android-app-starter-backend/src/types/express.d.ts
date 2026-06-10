import type { AppUser } from './schemas.js';

declare global {
  namespace Express {
    interface User extends Partial<AppUser> {}

    interface Request {
      rateLimit?: {
        limit: number;
        remaining: number;
        resetTime?: Date;
      };
    }
  }
}

export {};
