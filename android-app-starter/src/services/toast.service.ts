import { toastController } from '@ionic/vue';

export const toastService = {
  async presentToastError(message: string, duration = 3000) {
    await this.presentToast(message, 'danger', duration);
  },

  async presentToastSuccess(message: string, duration = 3000) {
    await this.presentToast(message, 'success', duration);
  },

  async presentToastWarning(message: string, duration = 3000) {
    await this.presentToast(message, 'warning', duration);
  },

  async presentToast(message: string, color: string = 'primary', duration = 3000) {
    const toast = await toastController.create({
      message,
      position: 'top',
      color,
      duration,
      buttons: [{ side: 'end', role: 'cancel', icon: 'close' }],
    });
    await toast.present();
  },
};
