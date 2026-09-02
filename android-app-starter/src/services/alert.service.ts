import { actionSheetController, alertController } from '@ionic/vue';
import type { ActionSheetButton, AlertButton } from '@ionic/core';
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

  /**
   * Action sheet para escolhas do tipo "uma entre N", onde um alerta só caberia dois ou três
   * botões. Devolve o `{ role, data }` do dismiss — identifique o botão tocado pelo `data`,
   * já que vários botões costumam repetir o mesmo `role`.
   */
  async presentCustomActionSheet(options: {
    header: string;
    subHeader?: string;
    buttons: ActionSheetButton[];
    cssClass?: string;
  }) {
    const actionSheet = await actionSheetController.create({
      header: options.header,
      subHeader: options.subHeader,
      cssClass: options.cssClass || 'action-sheet-primary',
      buttons: options.buttons,
    });
    await actionSheet.present();
    return actionSheet.onDidDismiss();
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

  async presentAlertConfirmDanger(
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
      'danger',
    );
  },

  /**
   * Confirmação com cor. É por aqui que passam `presentAlertConfirmDanger` e
   * `presentAlertConfirmWarning`.
   *
   * O botão de confirmar é **não reentrante**: o Ionic mantém o alerta aberto enquanto o
   * handler devolve uma promessa, e num aparelho lento o segundo toque dispara a mesma
   * exclusão de novo — a segunda responde 404 depois de uma que já deu certo.
   */
  async presentAlertConfirmWithColor(
    header: string,
    message: string,
    confirmText: string,
    cancelText: string,
    confirmHandler?: () => void | Promise<void>,
    color = 'danger',
  ) {
    let confirming = false;
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
            role: color === 'danger' ? 'destructive' : 'confirm',
            cssClass: `alert-button-${color}`,
            handler: async () => {
              // `false` impede o Ionic de fechar; sem isso o segundo toque executaria de novo.
              if (confirming) return false;
              confirming = true;
              try {
                await confirmHandler?.();
              } finally {
                confirming = false;
              }
              resolve(true);
            },
          },
        ],
      }).then((alert) => alert.present());
    });
  },
};
