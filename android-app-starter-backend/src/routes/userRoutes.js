import express from 'express';
import {
  getCurrentUserProfile,
  getUserProfile,
  updateUserProfile
} from '../controllers/userController.js';
import { validateJWTToken } from '../middlewares/authMiddleware.js';
import { validateUserProfileUpdate } from '../middlewares/validation.js';

const router = express.Router();

router.use(validateJWTToken);

router.get('/users/me', getCurrentUserProfile);
router.get('/users/:id', getUserProfile);
router.put('/users/:id', validateUserProfileUpdate, updateUserProfile);

export default router;
