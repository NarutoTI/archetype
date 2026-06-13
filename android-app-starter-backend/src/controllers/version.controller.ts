import type { Request, Response } from 'express';
import { getAppVersionInfo } from '../services/versionService.js';
import logger from '../config/logger.js';

export const getAppVersion = (_req: Request, res: Response) => {
  try {
    const versionInfo = getAppVersionInfo();
    logger.info('App version info requested');
    res.status(200).json(versionInfo);
  } catch (error) {
    logger.error({ err: error }, 'Error getting app version info');
    res.status(500).json({ error: 'Failed to retrieve version information' });
  }
};

