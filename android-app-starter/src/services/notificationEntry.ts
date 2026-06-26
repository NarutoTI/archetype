import type { Router } from 'vue-router';
import type { DeliveredNotificationSchema } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
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
 * notificação, então cruzamos os IDs entregues com o índice local
 * (`notificationLaunchIndexService`) e mostramos um prompt com os dados.
 *
 * Rota destino da ação "Abrir": `entry.routePath` quando presente, senão o
 * fallback genérico do starter (`DEFAULT_NOTIFICATION_OPEN_PATH`). A ação "Ver
 * notificações" vai para a aba de notificações.
 */
export type NotificationEntryDispatchReason = 'cold-start' | 'app-resume';

class NotificationEntry {
  private router: Router | null = null;
  private installed = false;
  private resumeListenerHandle: PluginListenerHandle | null = null;
  private handledDeliveredIds = new Set<number>();
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

    const deliveredNotifications = await notificationService.getDeliveredNotifications();
    const deliveredIds = deliveredNotifications
      .map(notification => notification.id)
      .filter(id => typeof id === 'number' && !this.handledDeliveredIds.has(id));

    if (!deliveredIds.length) return false;

    const entries = await notificationLaunchIndexService.getEntriesByIds(deliveredIds);
    if (!entries.length) return false;

    this.isPromptOpen = true;
    try {
      const handled = entries.length === 1
        ? await this.presentSingleNotificationPrompt(entries[0], deliveredNotifications)
        : await this.presentMultipleNotificationsPrompt(entries);

      for (const id of deliveredIds) {
        this.handledDeliveredIds.add(id);
      }

      logger.log(`notificationEntry: handled delivered notification prompt (${reason})`);
      return handled;
    } finally {
      this.isPromptOpen = false;
    }
  }

  private async presentSingleNotificationPrompt(
    entry: NotificationLaunchEntry,
    deliveredNotifications: DeliveredNotificationSchema[]
  ): Promise<boolean> {
    const result = await alertService.presentCustomAlert({
      header: i18n.global.t('notifications.deliveredTitle'),
      message: this.buildSingleNotificationMessage(entry),
      cssClass: 'alert-warning',
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
      await this.openTarget(entry, deliveredNotifications);
      return true;
    }

    if (result.role === 'view-notifications') {
      await this.openNotificationsList();
      return true;
    }

    return true;
  }

  private async presentMultipleNotificationsPrompt(entries: NotificationLaunchEntry[]): Promise<boolean> {
    const result = await alertService.presentCustomAlert({
      header: i18n.global.t('notifications.deliveredTitleMultiple', { count: entries.length }),
      message: this.buildMultipleNotificationsMessage(entries),
      cssClass: 'alert-warning',
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

  private buildSingleNotificationMessage(entry: NotificationLaunchEntry): string {
    const parts = [
      `<p><strong>${this.escapeHtml(entry.title)}</strong></p>`,
    ];

    if (entry.body) {
      parts.push(`<p>${this.escapeHtml(entry.body)}</p>`);
    }

    return parts.join('');
  }

  private buildMultipleNotificationsMessage(entries: NotificationLaunchEntry[]): string {
    const previewItems = entries
      .slice(0, 3)
      .map(entry => `<li>${this.escapeHtml(entry.title)}</li>`)
      .join('');

    const remaining = Math.max(entries.length - 3, 0);
    const remainingText = remaining > 0
      ? `<p>${this.escapeHtml(i18n.global.t('notifications.deliveredRemaining', { count: remaining }))}</p>`
      : '';

    return [
      `<p>${this.escapeHtml(i18n.global.t('notifications.deliveredMessage', { count: entries.length }))}</p>`,
      previewItems ? `<ul>${previewItems}</ul>` : '',
      remainingText,
    ].join('');
  }

  private async openTarget(
    entry: NotificationLaunchEntry,
    deliveredNotifications: DeliveredNotificationSchema[]
  ): Promise<void> {
    const delivered = deliveredNotifications.filter(notification => notification.id === entry.id);
    await notificationService.removeDeliveredNotifications(delivered);
    await notificationLaunchIndexService.removeEntriesByIds([entry.id]);

    await this.router!.push(entry.routePath || DEFAULT_NOTIFICATION_OPEN_PATH);
  }

  private async openNotificationsList(): Promise<void> {
    await this.router!.push(NOTIFICATIONS_PATH);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  _resetForTests(): void {
    void this.resumeListenerHandle?.remove?.();
    this.resumeListenerHandle = null;
    this.router = null;
    this.installed = false;
    this.handledDeliveredIds = new Set<number>();
    this.isPromptOpen = false;
  }
}

export const notificationEntry = new NotificationEntry();
