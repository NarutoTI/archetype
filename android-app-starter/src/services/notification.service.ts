import {
  LocalNotifications,
  type PendingLocalNotificationSchema,
  type DeliveredNotificationSchema,
  type Schedule,
  Weekday,
} from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import type { AlertButton } from '@ionic/core';
import i18n from '@/i18n';
import { alertService } from '@/services/alert.service';
import { capacitorService } from '@/services/capacitor.service';
import { notificationLaunchIndexService } from '@/services/notificationLaunchIndex.service';
import { createLocalDateTime, dateTimeToLocaleString } from '@/utils/date.utils';
import { logger } from '@/utils/logger';

export type NotificationRepeat = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface AppNotificationInput {
  key: string;
  title: string;
  body?: string;
  date?: string;
  time?: string;
  at?: Date;
  repeat?: NotificationRepeat;
  extra?: Record<string, unknown>;
}

class NotificationService {
  private isSupported = false;
  private permissionsGranted = false;
  private initialized = false;
  private platform: string = 'unknown';

  constructor() {
    void this.initialize();
  }

  private async initialize() {
    try {
      this.platform = Capacitor.getPlatform();
      if (!Capacitor.isPluginAvailable('LocalNotifications')) {
        this.initialized = true;
        return;
      }

      this.isSupported = true;

      await LocalNotifications.registerActionTypes({
        types: [{
          id: 'OPEN_APP',
          actions: [{ id: 'open', title: 'Open', foreground: true }],
        }],
      }).catch(() => {});

      if (this.platform === 'android') {
        await LocalNotifications.createChannel({
          id: 'default',
          name: 'General',
          description: 'General notifications',
          importance: 4,
          visibility: 1,
          lights: true,
          vibration: true,
        }).catch((error) => logger.warn('Failed to create default notification channel:', error));
      }

      await this.checkAndRequestPermissions();
    } catch (error) {
      logger.error('Error initializing notifications:', error);
    } finally {
      this.initialized = true;
    }
  }

  private async waitUntilInitialized() {
    while (!this.initialized) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private async checkAndRequestPermissions(forceRequest = false): Promise<boolean> {
    if (!this.isSupported && Capacitor.isNativePlatform()) {
      this.permissionsGranted = false;
      return false;
    }

    try {
      const permission = await LocalNotifications.checkPermissions();
      if (permission.display === 'granted') {
        this.permissionsGranted = true;
        return true;
      }

      if (permission.display === 'denied' && !forceRequest) {
        this.permissionsGranted = false;
        return false;
      }

      if (forceRequest || permission.display === 'prompt' || permission.display === 'prompt-with-rationale') {
        const request = await LocalNotifications.requestPermissions();
        this.permissionsGranted = request.display === 'granted';
        if (this.permissionsGranted) return true;
      }

      this.permissionsGranted = false;
      return false;
    } catch (error) {
      logger.error('Error checking notification permissions:', error);
      this.permissionsGranted = false;
      return false;
    }
  }

  async showPermissionDialog(): Promise<boolean> {
    const currentPermission = await LocalNotifications.checkPermissions();
    if (currentPermission.display === 'granted') {
      this.permissionsGranted = true;
      return true;
    }

    const buttons: AlertButton[] = [];
    if (currentPermission.display === 'prompt' || currentPermission.display === 'prompt-with-rationale') {
      buttons.push({
        text: i18n.global.t('notifications.grantPermission'),
        role: 'request',
        handler: async () => {
          await LocalNotifications.requestPermissions();
        },
      });
    }

    buttons.push({
      text: i18n.global.t('notifications.openSettings'),
      role: 'open-settings',
      handler: async () => {
        await capacitorService.openSettingsWithCallback({
          checkPermission: async () => {
            const nextPermission = await LocalNotifications.checkPermissions();
            const granted = nextPermission.display === 'granted';
            this.permissionsGranted = granted;
            return { granted };
          },
          successMessage: i18n.global.t('notifications.permissionGranted'),
          deniedMessage: i18n.global.t('notifications.permissionDenied'),
        });
        return false;
      },
    });

    buttons.push({ text: i18n.global.t('common.cancel'), role: 'cancel' });

    await alertService.presentCustomAlert({
      header: i18n.global.t('notifications.permissionNeeded'),
      message: i18n.global.t('notifications.permissionRequired'),
      buttons,
    });

    const finalPermission = await LocalNotifications.checkPermissions();
    this.permissionsGranted = finalPermission.display === 'granted';
    return this.permissionsGranted;
  }

  async requestPermissions(): Promise<boolean> {
    await this.waitUntilInitialized();
    return this.checkAndRequestPermissions();
  }

  private buildSchedule(input: AppNotificationInput): Schedule {
    const at = input.at || (input.date && input.time ? createLocalDateTime(input.date, input.time) : undefined);
    if (!input.repeat) {
      return { at: at || new Date(Date.now() + 60 * 1000) };
    }

    const base = at || new Date(Date.now() + 60 * 1000);
    const hour = base.getHours();
    const minute = base.getMinutes();

    if (input.repeat === 'daily') {
      return { on: { hour, minute }, repeats: true };
    }

    if (input.repeat === 'weekly') {
      const weekday = (base.getDay() + 1) as Weekday;
      return { on: { weekday, hour, minute }, repeats: true };
    }

    if (input.repeat === 'monthly') {
      return { on: { day: base.getDate(), hour, minute }, repeats: true };
    }

    return {
      on: { month: base.getMonth() + 1, day: base.getDate(), hour, minute },
      repeats: true,
    };
  }

  generateNotificationId(key: string): number {
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) | 0;
    }
    const value = Math.abs(hash) % 2000000000;
    return value === 0 ? 1 : value;
  }

  async scheduleNotification(input: AppNotificationInput): Promise<number | null> {
    await this.waitUntilInitialized();
    if (!this.isSupported && Capacitor.isNativePlatform()) {
      throw new Error(i18n.global.t('notifications.notSupported'));
    }

    const ok = await this.checkAndRequestPermissions(true);
    if (!ok) return null;

    const id = this.generateNotificationId(input.key);
    const body = input.body || '';
    await LocalNotifications.schedule({
      notifications: [{
        id,
        title: input.title,
        body,
        schedule: this.buildSchedule(input),
        channelId: this.platform === 'android' ? 'default' : undefined,
        actionTypeId: 'OPEN_APP',
        extra: {
          key: input.key,
          ...input.extra,
        },
      }],
    });

    // Best-effort: índice local para o caso de abertura pelo ícone com badge.
    // Nunca deve quebrar o agendamento se a persistência falhar.
    const scheduledAt = input.at
      || (input.date && input.time ? createLocalDateTime(input.date, input.time) : undefined);
    const routePath = typeof input.extra?.routePath === 'string' ? input.extra.routePath : undefined;
    try {
      await notificationLaunchIndexService.upsertEntries([{
        id,
        key: input.key,
        title: input.title,
        body,
        routePath,
        scheduledAtMs: scheduledAt?.getTime(),
      }]);
    } catch (error) {
      logger.warn('Failed to update notification launch index:', error);
    }

    return id;
  }

  async cancelNotification(id: number): Promise<void> {
    await LocalNotifications.cancel({ notifications: [{ id }] });
    await notificationLaunchIndexService.removeEntriesByIds([id]).catch((error) =>
      logger.warn('Failed to remove notification launch index entry:', error));
  }

  async cancelAllNotifications(): Promise<void> {
    const pending = await this.getPendingNotifications();
    if (!pending.length) {
      await notificationLaunchIndexService.clear().catch(() => {});
      return;
    }
    await LocalNotifications.cancel({
      notifications: pending.map((notification) => ({ id: notification.id })),
    });
    await notificationLaunchIndexService.clear().catch((error) =>
      logger.warn('Failed to clear notification launch index:', error));
  }

  async getDeliveredNotifications(): Promise<DeliveredNotificationSchema[]> {
    try {
      const result = await LocalNotifications.getDeliveredNotifications();
      return result.notifications || [];
    } catch (error) {
      logger.error('Error getting delivered notifications:', error);
      return [];
    }
  }

  async removeDeliveredNotifications(notifications: DeliveredNotificationSchema[]): Promise<void> {
    if (!notifications.length) return;
    try {
      await LocalNotifications.removeDeliveredNotifications({ notifications });
    } catch (error) {
      logger.error('Error removing delivered notifications:', error);
    }
  }

  async getPendingNotifications(): Promise<PendingLocalNotificationSchema[]> {
    try {
      const result = await LocalNotifications.getPending();
      return result.notifications || [];
    } catch (error) {
      logger.error('Error getting pending notifications:', error);
      return [];
    }
  }

  async testNotification(): Promise<boolean> {
    const id = await this.scheduleNotification({
      key: 'starter-test-notification',
      title: i18n.global.t('notifications.testTitle'),
      body: i18n.global.t('notifications.testBody'),
      at: new Date(Date.now() + 10000),
    });
    return id !== null;
  }

  async debugNotificationStatus(): Promise<string> {
    const permissions = await LocalNotifications.checkPermissions().catch(() => ({ display: 'unknown' }));
    const pending = await this.getPendingNotifications();
    return [
      `Platform: ${this.platform}`,
      `Supported: ${this.isSupported ? 'yes' : 'no'}`,
      `Permissions: ${permissions.display}`,
      `Pending: ${pending.length}`,
      `Now: ${dateTimeToLocaleString(new Date())}`,
    ].join('\n');
  }
}

export const notificationService = new NotificationService();
