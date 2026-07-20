import type { Request, Response } from 'express';
import { getDb } from '../config/db.js';
import logger from '../config/logger.js';
import { sendTestPush } from '../services/fcmService.js';
import {
  getPushDevice,
  PushDeviceConflictError,
  registerPushDevice,
  removePushDevice,
  setAccountTimezone,
  setPushDeviceDeliveryMode,
  type RegisterPushDeviceInput,
} from '../services/pushDeviceService.js';
import type { ReminderDeliveryMode } from '../types/push.js';

function getRequestUserId(req: Request): string | null {
  const userId = req.user?._id?.toString() || req.user?.id;
  return userId || null;
}

export async function registerDevice(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
    }
    const result = await registerPushDevice(userId, req.body as RegisterPushDeviceInput);
    return res.status(200).json({
      success: true,
      device: {
        deviceId: result.device.deviceId,
        platform: result.device.platform,
        targetKind: result.device.targetKind,
        deliveryMode: result.device.deliveryMode,
        timezone: result.device.timezone,
        lastSeenAt: result.device.lastSeenAt,
      },
      accountTimezone: result.accountTimezone,
    });
  } catch (error) {
    logger.error({ err: error, deviceId: req.body?.deviceId }, 'Failed to register push device');
    if (error instanceof PushDeviceConflictError) {
      return res.status(409).json({
        success: false,
        code: 'PUSH_TARGET_CONFLICT',
        message: 'Push target is already registered to another account',
      });
    }
    return res.status(500).json({
      success: false,
      code: 'PUSH_DEVICE_REGISTRATION_FAILED',
      message: 'Could not register push device',
    });
  }
}

export async function getDevice(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
    }
    const result = await getPushDevice(userId, req.params.deviceId);
    return res.json({
      success: true,
      device: result.device ? {
        deviceId: result.device.deviceId,
        platform: result.device.platform,
        targetKind: result.device.targetKind,
        deliveryMode: result.device.deliveryMode,
        timezone: result.device.timezone,
        lastSeenAt: result.device.lastSeenAt,
      } : null,
      accountTimezone: result.accountTimezone,
    });
  } catch (error) {
    logger.error({ err: error, deviceId: req.params.deviceId }, 'Failed to read push device');
    return res.status(500).json({
      success: false,
      code: 'PUSH_DEVICE_READ_FAILED',
      message: 'Could not read push device',
    });
  }
}

export async function updateDeliveryMode(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
    }
    const updated = await setPushDeviceDeliveryMode(
      userId,
      req.params.deviceId,
      req.body.deliveryMode as ReminderDeliveryMode,
    );
    return res.status(updated ? 200 : 404).json({ success: updated });
  } catch (error) {
    logger.error({ err: error, deviceId: req.params.deviceId }, 'Failed to update push delivery mode');
    return res.status(500).json({
      success: false,
      code: 'PUSH_DEVICE_UPDATE_FAILED',
      message: 'Could not update push device',
    });
  }
}

export async function deleteDevice(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
    }
    const deleted = await removePushDevice(userId, req.params.deviceId);
    return res.status(deleted ? 200 : 404).json({ success: deleted });
  } catch (error) {
    logger.error({ err: error, deviceId: req.params.deviceId }, 'Failed to delete push device');
    return res.status(500).json({
      success: false,
      code: 'PUSH_DEVICE_DELETE_FAILED',
      message: 'Could not delete push device',
    });
  }
}

export async function updateAccountTimezone(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
    }
    await setAccountTimezone(userId, req.body.timezone);
    return res.json({ success: true, timezone: req.body.timezone });
  } catch (error) {
    logger.error({ err: error }, 'Failed to update push account timezone');
    return res.status(500).json({
      success: false,
      code: 'PUSH_TIMEZONE_UPDATE_FAILED',
      message: 'Could not update account timezone',
    });
  }
}

export async function testPush(req: Request, res: Response) {
  try {
    const userId = getRequestUserId(req);
    if (!userId) {
      return res.status(401).json({ success: false, code: 'UNAUTHORIZED' });
    }
    const result = await sendTestPush(getDb(), userId, req.body.deviceId);
    if (!result.targets) {
      return res.status(404).json({ success: false, code: 'PUSH_DEVICE_NOT_FOUND', ...result });
    }
    if (!result.delivered) {
      return res.status(502).json({ success: false, code: 'PUSH_NOT_DELIVERED', ...result });
    }
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    logger.error({ err: error, deviceId: req.body?.deviceId }, 'Failed to send test push');
    return res.status(502).json({
      success: false,
      code: 'PUSH_TEST_FAILED',
      message: 'Could not send test push',
    });
  }
}
