import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import {
  PushNotifications,
  type ActionPerformed,
  type Token,
} from '@capacitor/push-notifications';
import type { Router } from 'vue-router';
import api from '@/services/api.service';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';
import {
  reminderDeliveryService,
  type ReminderDeliveryMode,
} from '@/services/reminderDelivery.service';
import { DEFAULT_NOTIFICATION_OPEN_PATH } from '@/constants/notificationRoutes';
import packageJson from '../../package.json';

const TARGET_KEY = 'push-registration-target';
const REGISTRATION_TIMEOUT_MS = 15_000;

/**
 * Capacitor Push (FCM token) for Android.
 * Backend contract expected by generated apps:
 *   POST   /api/push/devices
 *   PUT    /api/push/devices/:deviceId/delivery-mode
 *   DELETE /api/push/devices/:deviceId
 *
 * Web Push (Firebase JS FID) is intentionally out of this starter — copy from
 * My Memories P4 when a product needs it.
 */
class PushNotificationService {
  private installed = false;
  private router: Router | null = null;
  private listenerHandles: PluginListenerHandle[] = [];
  private registrationResolve: ((target: string) => void) | null = null;
  private registrationReject: ((error: Error) => void) | null = null;
  private registrationPromise: Promise<string> | null = null;

  async install(router: Router): Promise<void> {
    this.router = router;
    if (this.installed || !reminderDeliveryService.supportsServerPush) return;
    this.installed = true;

    this.listenerHandles.push(
      await PushNotifications.addListener('registration', (token) => void this.onRegistration(token)),
      await PushNotifications.addListener('registrationError', (error) => {
        this.registrationReject?.(new Error(error.error));
        this.clearRegistrationWaiter();
        logger.error('Push registration failed:', error);
      }),
      await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
        void this.openNotification(event);
      }),
    );
    await this.createAndroidChannel();
  }

  private async createAndroidChannel(): Promise<void> {
    try {
      await PushNotifications.createChannel({
        id: 'default',
        name: String(i18n.global.t('notifications.title')),
        importance: 4,
        visibility: 1,
        lights: true,
        vibration: true,
      });
    } catch (error) {
      logger.warn('Could not create Android push channel:', error);
    }
  }

  private async persistRegistrationTarget(target: string): Promise<void> {
    try {
      await Preferences.set({ key: TARGET_KEY, value: target });
    } catch (error) {
      logger.warn('Could not persist the refreshed push target:', error);
    }
  }

  private async finishRegistration(target: string): Promise<void> {
    const registrationWasRequested = Boolean(this.registrationResolve);
    await this.persistRegistrationTarget(target);
    this.registrationResolve?.(target);
    this.clearRegistrationWaiter();

    // Refresh only when push is the EFFECTIVE channel (not merely desired).
    if (!registrationWasRequested && reminderDeliveryService.effectiveMode.value === 'push') {
      try {
        await this.registerWithBackend(target, 'push');
      } catch (error) {
        logger.warn('Could not refresh push target with backend:', error);
      }
    }
  }

  private async onRegistration(token: Token): Promise<void> {
    await this.finishRegistration(token.value);
  }

  private clearRegistrationWaiter(): void {
    this.registrationResolve = null;
    this.registrationReject = null;
  }

  private routeFromPushData(data: Record<string, unknown> | undefined): string {
    const routePath = data?.routePath ?? data?.path;
    if (typeof routePath === 'string' && routePath.startsWith('/')) return routePath;
    return DEFAULT_NOTIFICATION_OPEN_PATH;
  }

  private async navigateFromPushData(data: Record<string, unknown> | undefined): Promise<void> {
    if (!this.router) return;
    await this.router.isReady();
    await this.router.push(this.routeFromPushData(data));
  }

  private async openNotification(event: ActionPerformed): Promise<void> {
    await this.navigateFromPushData(event.notification.data);
  }

  private registrationWaiter(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.registrationResolve = resolve;
      this.registrationReject = reject;
      window.setTimeout(() => {
        if (this.registrationReject !== reject) return;
        reject(new Error('Push registration timed out'));
        this.clearRegistrationWaiter();
      }, REGISTRATION_TIMEOUT_MS);
    });
  }

  private async requestTarget(): Promise<string> {
    if (this.registrationPromise) return this.registrationPromise;
    this.registrationPromise = this.performTargetRegistration()
      .finally(() => { this.registrationPromise = null; });
    return this.registrationPromise;
  }

  private async performTargetRegistration(): Promise<string> {
    const current = await PushNotifications.checkPermissions();
    const permission = current.receive === 'prompt'
      ? await PushNotifications.requestPermissions()
      : current;
    if (permission.receive !== 'granted') throw new Error('Push permission was not granted');

    const registration = this.registrationWaiter();
    try {
      await PushNotifications.register();
    } catch (error) {
      this.registrationReject?.(error instanceof Error ? error : new Error(String(error)));
      this.clearRegistrationWaiter();
    }
    return registration;
  }

  private timezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  }

  private async registerWithBackend(
    targetId: string,
    deliveryMode: ReminderDeliveryMode,
  ): Promise<void> {
    const deviceId = await reminderDeliveryService.getDeviceId();
    await api.post('/push/devices', {
      deviceId,
      targetId,
      targetKind: 'token',
      platform: 'android',
      deliveryMode,
      timezone: this.timezone(),
      language: i18n.global.locale.value,
      appVersion: packageJson.version,
    });
  }

  async reconcileAfterLogin(): Promise<ReminderDeliveryMode> {
    await reminderDeliveryService.initialize();
    if (!reminderDeliveryService.supportsServerPush) return 'local';
    if (reminderDeliveryService.desiredMode.value === 'local') {
      await reminderDeliveryService.setEffectiveMode('local');
      const deviceId = await reminderDeliveryService.getDeviceId();
      try {
        await api.put(`/push/devices/${deviceId}/delivery-mode`, { deliveryMode: 'local' });
      } catch (error) {
        if ((error as { response?: { status?: number } })?.response?.status !== 404) {
          logger.warn('Could not reconcile local delivery mode with backend:', error);
        }
      }
      return 'local';
    }

    const previousEffectiveMode = reminderDeliveryService.effectiveMode.value;
    try {
      const target = await this.requestTarget();
      await this.registerWithBackend(target, 'push');
      await reminderDeliveryService.setEffectiveMode('push');
      const { localNotificationService } = await import('@/services/localNotification.service');
      await localNotificationService.cancelAllNotifications();
      return 'push';
    } catch (error) {
      // Transient failure while push was already active: keep push.
      if (previousEffectiveMode === 'push') {
        logger.warn('Push reconcile failed transiently; keeping push delivery:', error);
        return 'push';
      }
      logger.warn('Push reconciliation failed; falling back to local delivery:', error);
      await reminderDeliveryService.setEffectiveMode('local');
      return 'local';
    }
  }

  async setDeliveryMode(mode: ReminderDeliveryMode): Promise<ReminderDeliveryMode> {
    if (!reminderDeliveryService.supportsServerPush) return 'local';

    const previousDesired = reminderDeliveryService.desiredMode.value;
    await reminderDeliveryService.setDesiredMode(mode);
    const deviceId = await reminderDeliveryService.getDeviceId();

    if (mode === 'local') {
      const previous = reminderDeliveryService.effectiveMode.value;
      await reminderDeliveryService.setEffectiveMode('local');
      try {
        try {
          await api.put(`/push/devices/${deviceId}/delivery-mode`, { deliveryMode: 'local' });
        } catch (error) {
          if ((error as { response?: { status?: number } })?.response?.status !== 404) throw error;
        }
      } catch (error) {
        if (previous === 'push') await reminderDeliveryService.setEffectiveMode('push');
        await reminderDeliveryService.setDesiredMode(previousDesired);
        throw error;
      }
      return 'local';
    }

    try {
      const target = await this.requestTarget();
      await this.registerWithBackend(target, 'push');
    } catch (error) {
      await reminderDeliveryService.setDesiredMode(previousDesired);
      throw error;
    }

    await reminderDeliveryService.setEffectiveMode('push');
    const { localNotificationService } = await import('@/services/localNotification.service');
    await localNotificationService.cancelAllNotifications();
    return 'push';
  }

  async sendTestPush(): Promise<void> {
    const deviceId = await reminderDeliveryService.getDeviceId();
    await api.post('/push/test', { deviceId });
  }

  async unregisterBeforeLogout(): Promise<void> {
    if (reminderDeliveryService.supportsServerPush) {
      const deviceId = await reminderDeliveryService.getDeviceId();
      try {
        // skipAuthHandling: se o JWT já caiu, este 401 não pode reabrir o alerta de sessão.
        await api.delete(`/push/devices/${deviceId}`, { skipAuthHandling: true });
      } catch (error) {
        logger.warn('Could not delete push device before logout:', error);
      }
      try {
        await PushNotifications.unregister();
      } catch (error) {
        logger.warn('Could not unregister native push target:', error);
      }
      await Preferences.remove({ key: TARGET_KEY });
      try {
        await PushNotifications.removeAllDeliveredNotifications();
      } catch (error) {
        logger.warn('Could not clear delivered push notifications on logout:', error);
      }
    }
    const { localNotificationService } = await import('@/services/localNotification.service');
    await localNotificationService.cancelAllNotifications();
    await reminderDeliveryService.setEffectiveMode('local');
  }
}

export const pushNotificationService = new PushNotificationService();
