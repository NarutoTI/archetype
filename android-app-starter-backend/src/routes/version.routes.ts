import { Router } from 'express';
import { getAppVersion } from '../controllers/version.controller.js';

const router = Router();

// Endpoint público sem autenticação.
router.get('/version', getAppVersion);

export default router;

