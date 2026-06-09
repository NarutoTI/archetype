import { Router } from 'express';
import { getAppVersion } from '../controllers/version.controller.js';

const router = Router();

// Public endpoint - no authentication required
router.get('/version', getAppVersion);

export default router;

