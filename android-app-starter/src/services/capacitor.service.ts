import { App } from '@capacitor/app';
import { Camera } from '@capacitor/camera';
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';
import { toastService } from '@/services/toast.service';

export interface PermissionCheckResult {
  granted: boolean;
  message?: string;
}

export interface OpenSettingsOptions {
  checkPermission: () => Promise<PermissionCheckResult>;
  successMessage: string;
  deniedMessage: string;
  onReturn?: (granted: boolean) => Promise<void>;
}

let cameraGranted: boolean | null = null;

export const capacitorService = {
  invalidateCameraPermissionCache(): void {
    cameraGranted = null;
  },

  async verifyAndRequestCameraPermissions(): Promise<boolean> {
    if (cameraGranted === true) return true;

    let permissions = await Camera.checkPermissions();
    if (permissions.camera !== 'granted') {
      permissions = await Camera.requestPermissions({ permissions: ['camera'] });
    }

    if (permissions.camera === 'granted') {
      cameraGranted = true;
      return true;
    }

    const { alertService } = await import('@/services/alert.service');
    const confirmed = await alertService.presentAlertConfirmWarning(
      i18n.global.t('media.cameraPermissionRequired'),
      i18n.global.t('media.cameraPermissionRequiredDescription'),
      i18n.global.t('common.yes'),
      i18n.global.t('common.no'),
    );

    if (!confirmed) {
      cameraGranted = false;
      return false;
    }

    await this.openSettingsWithCallback({
      checkPermission: async () => {
        const nextPermissions = await Camera.checkPermissions();
        return { granted: nextPermissions.camera === 'granted' };
      },
      successMessage: i18n.global.t('media.cameraPermissionGranted'),
      deniedMessage: i18n.global.t('media.cameraPermissionDenied'),
    });

    const finalPermissions = await Camera.checkPermissions();
    cameraGranted = finalPermissions.camera === 'granted';
    return cameraGranted;
  },

  async openSettings(): Promise<void> {
    await NativeSettings.open({
      optionAndroid: AndroidSettings.ApplicationDetails,
      optionIOS: IOSSettings.App,
    });
  },

  async openSettingsWithCallback(options: OpenSettingsOptions): Promise<void> {
    const { checkPermission, successMessage, deniedMessage, onReturn } = options;

    try {
      const sub = await App.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) return;

        const result = await checkPermission();
        if (result.granted) {
          await toastService.presentToastSuccess(result.message || successMessage);
        } else {
          await toastService.presentToastWarning(result.message || deniedMessage);
        }

        await onReturn?.(result.granted);
        await sub.remove();
      });

      await this.openSettings();
    } catch (error) {
      logger.error('Error opening native settings:', error);
      throw error;
    }
  },
};
