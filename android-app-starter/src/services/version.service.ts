import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import api from '@/services/api.service';
import { alertService } from '@/services/alert.service';
import { toastService } from '@/services/toast.service';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';

interface PlatformVersion {
  version: string;
  storeUrl: string;
}

interface VersionInfo {
  android: PlatformVersion;
  ios: PlatformVersion;
}

class VersionService {
  private isNewer(latestVersion: string, currentVersion: string): boolean {
    const latest = latestVersion.split('.').map(Number);
    const current = currentVersion.split('.').map(Number);
    for (let i = 0; i < Math.max(latest.length, current.length); i += 1) {
      const left = latest[i] || 0;
      const right = current[i] || 0;
      if (left > right) return true;
      if (left < right) return false;
    }
    return false;
  }

  async checkAndPromptForUpdate(showUpToDateMessage = false): Promise<void> {
    try {
      const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
      if (platform === 'web') return;

      const info = await App.getInfo();
      const response = await api.get<VersionInfo>('/version');
      const latest = response.data[platform];

      if (this.isNewer(latest.version, info.version)) {
        await alertService.presentCustomAlert({
          header: i18n.global.t('version.updateAvailable'),
          message: i18n.global.t('version.updateMessage', {
            current: info.version,
            latest: latest.version,
          }),
          buttons: [
            { text: i18n.global.t('version.later'), role: 'cancel' },
            {
              text: i18n.global.t('version.updateNow'),
              role: 'confirm',
              handler: async () => {
                await Browser.open({ url: latest.storeUrl });
              },
            },
          ],
        });
      } else if (showUpToDateMessage) {
        await toastService.presentToastSuccess(i18n.global.t('version.upToDate'));
      }
    } catch (error) {
      logger.error('Error checking version:', error);
      if (showUpToDateMessage) {
        await toastService.presentToastError(i18n.global.t('version.errorChecking'));
      }
    }
  }
}

export const versionService = new VersionService();
