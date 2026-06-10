import express from 'express';
import {
  createTaskController,
  deleteTaskController,
  getTask,
  listTasks,
  listTasksByYear,
  updateTaskController
} from '../controllers/taskController.js';
import { validateJWTToken } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.use(validateJWTToken);

router.get('/tasks', listTasks);
router.get('/tasks/year/:year', listTasksByYear);
router.get('/tasks/:id', getTask);
router.post('/tasks', createTaskController);
router.put('/tasks/:id', updateTaskController);
router.delete('/tasks/:id', deleteTaskController);

export default router;
