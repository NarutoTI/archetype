import { alertController } from '@ionic/vue';
import type { AlertButton } from '@ionic/core';
import i18n from '@/i18n';

export const alertService = {
  async presentAlertError(header: string, message: string) {
    await this.presentAlert(header, message, 'danger');
  },

  async presentAlertSuccess(header: string, message: string) {
    await this.presentAlert(header, message, 'success');
  },

  async presentAlertWarning(header: string, message: string) {
    await this.presentAlert(header, message, 'warning');
  },

  async presentAlertInfo(header: string, message: string) {
    await this.presentAlert(header, message, 'primary');
  },

  async presentAlert(header: string, message: string, color = 'primary') {
    const alert = await alertController.create({
      header,
      message,
      cssClass: `alert-${color}`,
      buttons: [{
        text: i18n.global.t('common.ok'),
        role: 'cancel',
        cssClass: `alert-button-${color}`,
      }],
    });
    await alert.present();
  },

  async presentCustomAlert(options: {
    header: string;
    message: string;
    buttons: AlertButton[];
    cssClass?: string;
  }) {
    const alert = await alertController.create({
      header: options.header,
      message: options.message,
      cssClass: options.cssClass || 'alert-primary',
      buttons: options.buttons,
    });
    await alert.present();
    return alert.onDidDismiss();
  },

  async presentAlertConfirmWarning(
    header: string,
    message: string,
    confirmText = i18n.global.t('common.ok'),
    cancelText = i18n.global.t('common.cancel'),
    confirmHandler?: () => void | Promise<void>,
  ) {
    return this.presentAlertConfirmWithColor(
      header,
      message,
      confirmText,
      cancelText,
      confirmHandler,
      'warning',
    );
  },

  async presentAlertConfirmWithColor(
    header: string,
    message: string,
    confirmText: string,
    cancelText: string,
    confirmHandler?: () => void | Promise<void>,
    color = 'danger',
  ) {
    return new Promise<boolean>((resolve) => {
      alertController.create({
        header,
        message,
        cssClass: `alert-${color}`,
        buttons: [
          {
            text: cancelText,
            role: 'cancel',
            cssClass: `alert-button-${color}`,
            handler: () => resolve(false),
          },
          {
            text: confirmText,
            role: 'confirm',
            cssClass: `alert-button-${color}`,
            handler: async () => {
              await confirmHandler?.();
              resolve(true);
            },
          },
        ],
      }).then((alert) => alert.present());
    });
  },
};
