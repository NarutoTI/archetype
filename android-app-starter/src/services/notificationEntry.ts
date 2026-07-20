import type { Router } from 'vue-router';
import type { DeliveredNotificationSchema } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  PushNotifications,
  type PushNotificationSchema,
} from '@capacitor/push-notifications';
import { bootReadyPromise } from '@/services/boot';
import i18n from '@/i18n';
import { alertService } from '@/services/alert.service';
import { notificationService } from '@/services/notification.service';
import {
  notificationLaunchIndexService,
  type NotificationLaunchEntry,
} from '@/services/notificationLaunchIndex.service';
import { useUserStore } from '@/stores/userStore';
import { logger } from '@/utils/logger';
import {
  DEFAULT_NOTIFICATION_OPEN_PATH,
  NOTIFICATIONS_PATH,
} from '@/constants/notificationRoutes';

/**
 * Trata a abertura do app pelo ícone do launcher quando há notificações já
 * entregues com badge. Esse caminho não carrega o payload do toque na
 * notificação, então cruzamos a bandeja local + push com o índice local
 * (`notificationLaunchIndexService`) e mostramos um prompt com os dados.
 *
 * Push: `data.routePath` / `data.path` (mesma convenção do toque direto).
 * Local: `entry.routePath` do índice. Fallback: `DEFAULT_NOTIFICATION_OPEN_PATH`.
 */
export type NotificationEntryDispatchReason = 'cold-start' | 'app-resume';

type DeliveredPromptSource = 'local' | 'push';

interface DeliveredPromptEntry {
  key: string;
  source: DeliveredPromptSource;
  /** Dedup key when the same reminder appears in both trays (mode-switch race). */
  identity: string;
  title: string;
  body?: string;
  routePath?: string;
  localId?: number;
  localDelivered?: DeliveredNotificationSchema;
  pushNotification?: PushNotificationSchema;
  shadowedEntries?: DeliveredPromptEntry[];
}

class NotificationEntry {
  private router: Router | null = null;
  private installed = false;
  private resumeListenerHandle: PluginListenerHandle | null = null;
  private handledDeliveredKeys = new Set<string>();
  private isPromptOpen = false;

  install(router: Router): void {
    if (this.installed) return;
    this.installed = true;
    this.router = router;

    if (!Capacitor.isNativePlatform()) return;

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.dispatchIfDelivered('app-resume');
    }).then(handle => {
      this.resumeListenerHandle = handle;
    }).catch(err => logger.error('notificationEntry: appStateChange listener failed', err));
  }

  async dispatchIfDelivered(reason: NotificationEntryDispatchReason): Promise<boolean> {
    if (!this.router) {
      logger.error('notificationEntry: dispatchIfDelivered called before install');
      return false;
    }

    if (!Capacitor.isNativePlatform() || this.isPromptOpen) return false;

    await bootReadyPromise;
    await this.router.isReady();

    if (!useUserStore().isAuthenticated) return false;

    const entries = await this.collectDeliveredEntries();
    if (!entries.length) return false;

    this.isPromptOpen = true;
    try {
      const handled = entries.length === 1
        ? await this.presentSingleNotificationPrompt(entries[0])
        : await this.presentMultipleNotificationsPrompt(entries);

      for (const entry of entries) {
        for (const sourceEntry of this.sourceEntries(entry)) {
          this.handledDeliveredKeys.add(sourceEntry.key);
        }
      }

      logger.log(`notificationEntry: handled delivered notification prompt (${reason})`);
      return handled;
    } finally {
      this.isPromptOpen = false;
    }
  }

  private async collectDeliveredEntries(): Promise<DeliveredPromptEntry[]> {
    const [localEntries, pushEntries] = await Promise.all([
      this.collectLocalDeliveredEntries(),
      this.collectPushDeliveredEntries(),
    ]);

    // Prefer local when the same identity appears in both trays.
    const byIdentity = new Map<string, DeliveredPromptEntry>();
    const merged: DeliveredPromptEntry[] = [];
    for (const entry of [...localEntries, ...pushEntries]) {
      const existing = byIdentity.get(entry.identity);
      if (existing) {
        existing.shadowedEntries ??= [];
        existing.shadowedEntries.push(entry);
        continue;
      }
      byIdentity.set(entry.identity, entry);
      merged.push(entry);
    }
    return merged;
  }

  private async collectLocalDeliveredEntries(): Promise<DeliveredPromptEntry[]> {
    const deliveredNotifications = await notificationService.getDeliveredNotifications();
    const deliveredIds = deliveredNotifications
      .map(notification => notification.id)
      .filter((id): id is number => typeof id === 'number' && !this.handledDeliveredKeys.has(`local:${id}`));

    if (!deliveredIds.length) return [];

    const launchEntries = await notificationLaunchIndexService.getEntriesByIds(deliveredIds);
    return launchEntries.map((launch) => this.fromLocalLaunch(launch, deliveredNotifications));
  }

  private fromLocalLaunch(
    launch: NotificationLaunchEntry,
    deliveredNotifications: DeliveredNotificationSchema[],
  ): DeliveredPromptEntry {
    return {
      key: `local:${launch.id}`,
      source: 'local',
      identity: launch.key || launch.routePath || `local:${launch.id}`,
      title: launch.title,
      body: launch.body,
      routePath: launch.routePath,
      localId: launch.id,
      localDelivered: deliveredNotifications.find(notification => notification.id === launch.id),
    };
  }

  private async collectPushDeliveredEntries(): Promise<DeliveredPromptEntry[]> {
    if (!Capacitor.isPluginAvailable('PushNotifications')) return [];

    try {
      const result = await PushNotifications.getDeliveredNotifications();
      const notifications = result.notifications ?? [];
      const entries: DeliveredPromptEntry[] = [];

      for (const notification of notifications) {
        const key = `push:${notification.id}`;
        if (this.handledDeliveredKeys.has(key)) continue;

        const title = notification.title?.trim()
          || String(notification.data?.title ?? '').trim()
          || String(i18n.global.t('notifications.title'));
        const body = notification.body?.trim()
          || String(notification.data?.body ?? '').trim()
          || undefined;
        const routePath = this.routePathFromPushData(notification.data);
        const identity = String(notification.data?.key ?? '').trim()
          || routePath
          || key;

        entries.push({
          key,
          source: 'push',
          identity,
          title,
          body: body || undefined,
          routePath,
          pushNotification: notification,
        });
      }

      return entries;
    } catch (error) {
      logger.warn('notificationEntry: could not read delivered push notifications:', error);
      return [];
    }
  }

  private routePathFromPushData(data: Record<string, unknown> | undefined): string | undefined {
    const routePath = data?.routePath ?? data?.path;
    if (typeof routePath === 'string' && routePath.startsWith('/')) return routePath;
    return undefined;
  }

  private async presentSingleNotificationPrompt(entry: DeliveredPromptEntry): Promise<boolean> {
    const result = await alertService.presentCustomAlert({
      header: i18n.global.t('notifications.deliveredTitle'),
      message: this.buildSingleNotificationMessage(entry),
      cssClass: 'alert-warning notification-delivered-alert',
      buttons: [
        {
          text: i18n.global.t('common.close'),
          role: 'cancel',
        },
        {
          text: i18n.global.t('notifications.deliveredView'),
          role: 'view-notifications',
        },
        {
          text: i18n.global.t('notifications.deliveredOpen'),
          role: 'open-target',
          cssClass: 'alert-button-warning',
        },
      ],
    });

    if (result.role === 'open-target') {
      await this.openTarget(entry);
      return true;
    }

    if (result.role === 'view-notifications') {
      await this.openNotificationsList();
      return true;
    }

    return true;
  }

  private async presentMultipleNotificationsPrompt(entries: DeliveredPromptEntry[]): Promise<boolean> {
    const result = await alertService.presentCustomAlert({
      header: i18n.global.t('notifications.deliveredTitleMultiple', { count: entries.length }),
      message: this.buildMultipleNotificationsMessage(entries),
      cssClass: 'alert-warning notification-delivered-alert',
      buttons: [
        {
          text: i18n.global.t('common.close'),
          role: 'cancel',
        },
        {
          text: i18n.global.t('notifications.deliveredView'),
          role: 'view-notifications',
          cssClass: 'alert-button-warning',
        },
      ],
    });

    if (result.role === 'view-notifications') {
      await this.openNotificationsList();
    }

    return true;
  }

  // Mensagens em texto puro: o Ionic 8 não renderiza mais HTML em alert por
  // padrão (innerHTMLTemplatesEnabled=false). As quebras de linha aparecem via
  // `white-space: pre-line` na classe .notification-delivered-alert (theme).
  private buildSingleNotificationMessage(entry: DeliveredPromptEntry): string {
    const parts = [entry.title];
    if (entry.body) parts.push(entry.body);
    return parts.join('\n\n');
  }

  private buildMultipleNotificationsMessage(entries: DeliveredPromptEntry[]): string {
    const previewItems = entries
      .slice(0, 3)
      .map(entry => `- ${entry.title}`)
      .join('\n');

    const remaining = Math.max(entries.length - 3, 0);
    const remainingText = remaining > 0
      ? i18n.global.t('notifications.deliveredRemaining', { count: remaining })
      : '';

    return [
      i18n.global.t('notifications.deliveredMessage', { count: entries.length }),
      previewItems,
      remainingText,
    ].filter(Boolean).join('\n\n');
  }

  private async openTarget(entry: DeliveredPromptEntry): Promise<void> {
    for (const sourceEntry of this.sourceEntries(entry)) {
      await this.removeDeliveredEntry(sourceEntry);
    }
    await this.router!.push(entry.routePath || DEFAULT_NOTIFICATION_OPEN_PATH);
  }

  private sourceEntries(entry: DeliveredPromptEntry): DeliveredPromptEntry[] {
    return [entry, ...(entry.shadowedEntries ?? [])];
  }

  private async removeDeliveredEntry(entry: DeliveredPromptEntry): Promise<void> {
    if (entry.source === 'local') {
      if (entry.localDelivered) {
        await notificationService.removeDeliveredNotifications([entry.localDelivered]);
      }
      if (typeof entry.localId === 'number') {
        await notificationLaunchIndexService.removeEntriesByIds([entry.localId]);
      }
      return;
    }

    if (entry.pushNotification) {
      try {
        await PushNotifications.removeDeliveredNotifications({
          notifications: [entry.pushNotification],
        });
      } catch (error) {
        logger.warn('notificationEntry: could not remove delivered push notification:', error);
      }
    }
  }

  private async openNotificationsList(): Promise<void> {
    await this.router!.push(NOTIFICATIONS_PATH);
  }

  _resetForTests(): void {
    void this.resumeListenerHandle?.remove?.();
    this.resumeListenerHandle = null;
    this.router = null;
    this.installed = false;
    this.handledDeliveredKeys = new Set<string>();
    this.isPromptOpen = false;
  }
}

export const notificationEntry = new NotificationEntry();
