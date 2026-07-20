import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  deleteDevice,
  getDevice,
  registerDevice,
  testPush,
  updateAccountTimezone,
  updateDeliveryMode,
} from '../controllers/pushController.js';
import { validateJWTToken } from '../middlewares/authMiddleware.js';
import { handleValidationErrors } from '../middlewares/validation.js';
import { isValidIanaTimeZone } from '../utils/timezone.js';

const router = Router();
const deviceIdValidation = param('deviceId').isUUID().withMessage('deviceId must be a UUID');

router.use(validateJWTToken);

router.post(
  '/devices',
  body('deviceId').isUUID().withMessage('deviceId must be a UUID'),
  body('targetId').isString().trim().isLength({ min: 20, max: 4096 }),
  body('targetKind').isIn(['fid', 'token']),
  body('platform').isIn(['android', 'web']),
  body('deliveryMode').optional().isIn(['push', 'local']),
  body('timezone').isString().custom(isValidIanaTimeZone),
  body('language').optional({ nullable: true }).isString().isLength({ max: 20 }),
  body('appVersion').optional({ nullable: true }).isString().isLength({ max: 40 }),
  handleValidationErrors,
  registerDevice,
);

router.post(
  '/test',
  body('deviceId').isUUID().withMessage('deviceId must be a UUID'),
  handleValidationErrors,
  testPush,
);

router.get('/devices/:deviceId', deviceIdValidation, handleValidationErrors, getDevice);

router.put(
  '/devices/:deviceId/delivery-mode',
  deviceIdValidation,
  body('deliveryMode').isIn(['push', 'local']),
  handleValidationErrors,
  updateDeliveryMode,
);

router.delete('/devices/:deviceId', deviceIdValidation, handleValidationErrors, deleteDevice);

router.put(
  '/timezone',
  body('timezone').isString().custom(isValidIanaTimeZone),
  handleValidationErrors,
  updateAccountTimezone,
);

export default router;
