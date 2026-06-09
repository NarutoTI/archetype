import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import passport, { isGoogleOAuthEnabled } from './config/passport.js';
import { connectToMongo, getDb } from './config/db.js';
import logger from './config/logger.js';
import { generalRateLimit } from './middlewares/rateLimitMiddleware.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

const healthPayload = () => ({
  status: 'ok',
  timestamp: Date.now(),
  env: process.env.NODE_ENV || 'development',
  port: PORT
});

app.get('/health', (_req, res) => res.status(200).json(healthPayload()));
app.get('/api/health', (_req, res) => res.status(200).json(healthPayload()));

app.use(helmet());
app.use(passport.initialize());

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const defaultOrigins = [
      'http://localhost:8100',
      'http://localhost:3000',
      'http://localhost',
      'capacitor://localhost',
      'ionic://localhost'
    ];
    const envOrigins = process.env.CORS_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean) || [];
    const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

    if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
      return callback(null, origin);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
}));

app.use(express.json({ limit: '1mb' }));
app.use(generalRateLimit);

async function startServer() {
  try {
    await isGoogleOAuthEnabled();

    const server = app.listen(PORT, () => {
      logger.info('Server is running on port %s', PORT);
      logger.info('Environment: %s', process.env.NODE_ENV || 'development');
    });

    await connectToMongo();
    app.locals.db = getDb();

    const authRoutes = (await import('./routes/auth/authRoutes.js')).default;
    const userRoutes = (await import('./routes/userRoutes.js')).default;
    const taskRoutes = (await import('./routes/taskRoutes.js')).default;
    const versionRoutes = (await import('./routes/version.routes.js')).default;

    app.use('/auth', authRoutes);
    app.use('/api', versionRoutes);
    app.use('/api', userRoutes);
    app.use('/api', taskRoutes);

    app.use((err, _req, res, _next) => {
      logger.error({ err }, 'Unhandled error');
      res.status(500).json({
        success: false,
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error'
      });
    });

    return server;
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

startServer();
