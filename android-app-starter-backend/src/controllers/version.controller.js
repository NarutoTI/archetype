import { getAppVersionInfo } from '../services/versionService.js';
import logger from '../config/logger.js';

/**
 * Get app version information
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAppVersion = (req, res) => {
  try {
    const versionInfo = getAppVersionInfo();
    logger.info('App version info requested');
    res.status(200).json(versionInfo);
  } catch (error) {
    logger.error('Error getting app version info: %j', error);
    res.status(500).json({ error: 'Failed to retrieve version information' });
  }
};

