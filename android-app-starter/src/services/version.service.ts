import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import api from '@/services/api.service';
import { alertService } from '@/services/alert.service';
import { toastService } from '@/services/toast.service';
import { logger } from '@/utils/logger';
import i18n from '@/i18n';
import type { OtaDescriptor } from './ota.service';
import { getOtaChannel } from './ota-channel.service';

interface PlatformVersion {
  version: string;
  storeUrl: string;
  /** Alvo OTA por linha nativa (produção). */
  ota?: Record<string, OtaDescriptor>;
  /** Alvo OTA por linha nativa (builds de teste / staging). */
  otaStaging?: Record<string, OtaDescriptor>;
}

interface VersionInfo {
  android: PlatformVersion;
  ios: PlatformVersion;
}

interface UpdateCheckResult {
  hasStoreUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  storeUrl: string;
  platform: 'android' | 'ios' | 'web';
  /** Descriptor OTA selecionado p/ a linha nativa + canal deste device, ou null. */
  ota: OtaDescriptor | null;
}

/** Resultado de uma checagem coordenada loja+OTA, p/ o chamador reagir com precisão. */
export interface AppUpdateOutcome {
  /** Um diálogo de update de loja foi mostrado. */
  storePrompted: boolean;
  /** Uma superfície de OTA foi mostrada/aplicada nesta sessão. */
  otaShown: boolean;
  /** A checagem de versão falhou (rede/parse). */
  error: boolean;
}

class VersionService {
  /**
   * Compara duas strings de versão semântica.
   * @returns true se latestVersion for mais nova que currentVersion.
   */
  private isNewer(latestVersion: string, currentVersion: string): boolean {
    try {
      const latest = latestVersion.split('.').map(Number);
      const current = currentVersion.split('.').map(Number);

      for (let i = 0; i < Math.max(latest.length, current.length); i++) {
        const l = latest[i] || 0;
        const c = current[i] || 0;

        if (l > c) return true;
        if (l < c) return false;
      }

      return false; // versões iguais
    } catch (error) {
      logger.error('Erro comparando versões:', error);
      return false;
    }
  }

  /**
   * Busca o payload público de `/version` e deriva: disponibilidade de update de
   * loja e o descriptor OTA da linha nativa DESTE device (pelo canal local).
   */
  async checkForUpdate(): Promise<UpdateCheckResult> {
    const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
    if (platform === 'web') {
      return { hasStoreUpdate: false, currentVersion: '0.0.0', latestVersion: '0.0.0', storeUrl: '', platform: 'web', ota: null };
    }

    const [info, response, channel] = await Promise.all([
      App.getInfo(),
      api.get<VersionInfo>('/version'),
      getOtaChannel(),
    ]);
    const currentVersion = info.version;
    const versionInfo = response.data;
    const platformInfo = platform === 'ios' ? versionInfo.ios : versionInfo.android;

    const latestVersion = platformInfo.version;
    const storeUrl = platformInfo.storeUrl;
    const hasStoreUpdate = this.isNewer(latestVersion, currentVersion);

    // Pega o descriptor OTA da linha nativa DESTE device, no canal local. Staging
    // nunca cai em produção (e vice-versa). Falha fechado se storage falhar.
    const map = channel === 'staging' ? platformInfo.otaStaging : platformInfo.ota;
    const rawOta = map?.[currentVersion] ?? null;
    // Valida o descriptor (editado à mão) antes de confiar: checksum/minNative
    // ausente ou colado na linha errada é rejeitado (fail-closed). Import tardio
    // pra ota.service só carregar quando há candidato.
    let ota: OtaDescriptor | null = null;
    if (rawOta) {
      const { sanitizeOtaDescriptor } = await import('./ota.service');
      ota = sanitizeOtaDescriptor(rawOta, currentVersion);
    }

    logger.log('Checagem de update:', { platform, currentVersion, latestVersion, hasStoreUpdate, channel, hasOta: !!ota });
    return { hasStoreUpdate, currentVersion, latestVersion, storeUrl, platform, ota };
  }

  /** Abre a loja com a URL dada. */
  async openStore(url: string): Promise<void> {
    try {
      await Browser.open({ url });
    } catch (error) {
      logger.error('Erro abrindo a loja:', error);
      throw error;
    }
  }

  /**
   * Mostra o prompt de update de loja. Resolve true se o usuário RECUSOU
   * (Depois/backdrop), false se escolheu atualizar (loja aberta) — para o
   * chamador oferecer um OTA de consolação só a quem recusou.
   */
  private async presentStoreUpdateAlert(info: UpdateCheckResult): Promise<boolean> {
    const result = await alertService.presentCustomAlert({
      header: i18n.global.t('version.updateAvailable'),
      message: i18n.global.t('version.updateMessage', { current: info.currentVersion, latest: info.latestVersion }),
      buttons: [
        { text: i18n.global.t('version.later'), role: 'cancel', cssClass: 'alert-button-secondary' },
        {
          text: i18n.global.t('version.updateNow'),
          role: 'confirm',
          cssClass: 'alert-button-primary',
          handler: async () => {
            try {
              await this.openStore(info.storeUrl);
            } catch (error) {
              logger.error('Erro abrindo a loja:', error);
              toastService.presentToastError(i18n.global.t('version.errorOpeningStore'));
            }
          },
        },
      ],
      cssClass: 'alert-primary',
    });
    return result.role !== 'confirm'; // cancel / backdrop => recusou
  }

  /**
   * Checagem coordenada de update (loja + OTA), um diálogo por sessão.
   *
   * Política: o update de LOJA tem prioridade e é oferecido PRIMEIRO. Se o
   * usuário recusar e a linha nativa dele tiver OTA, esse OTA é baixado em
   * SILÊNCIO (aplica na próxima abertura) — para quem não atualiza ainda receber
   * o fix da linha sem um 2º diálogo. Sem update de loja, o OTA é oferecido
   * normalmente (Agora / Depois / Cancelar).
   *
   * @param showUpToDateMessage mostra um toast quando nada está disponível (check manual)
   */
  async checkAndPromptForUpdate(showUpToDateMessage: boolean = false): Promise<AppUpdateOutcome> {
    let info: UpdateCheckResult;
    try {
      info = await this.checkForUpdate();
    } catch (error) {
      logger.error('Erro checando updates:', error);
      if (showUpToDateMessage) toastService.presentToastError(i18n.global.t('version.errorChecking'));
      return { storePrompted: false, otaShown: false, error: true };
    }

    // 1) Update de loja tem prioridade — oferecido primeiro.
    if (info.hasStoreUpdate) {
      const declined = await this.presentStoreUpdateAlert(info);
      // Recusou mas a linha tem fix: pega em silêncio (aplica na próxima abertura).
      if (declined && info.ota) {
        try {
          const { checkForOtaUpdate } = await import('./ota.service');
          const otaShown = await checkForOtaUpdate(info.ota, { silent: true });
          return { storePrompted: true, otaShown, error: false };
        } catch (error) {
          logger.error('OTA silencioso após recusa da loja falhou:', error);
        }
      }
      return { storePrompted: true, otaShown: false, error: false };
    }

    // 2) Sem update de loja — oferece o OTA da linha normalmente (Agora/Depois/Cancelar).
    if (info.ota) {
      try {
        const { checkForOtaUpdate } = await import('./ota.service');
        if (await checkForOtaUpdate(info.ota)) {
          return { storePrompted: false, otaShown: true, error: false };
        }
      } catch (error) {
        logger.error('Checagem de OTA falhou:', error);
      }
    }

    if (showUpToDateMessage) toastService.presentToastSuccess(i18n.global.t('version.upToDate'));
    return { storePrompted: false, otaShown: false, error: false };
  }
}

export const versionService = new VersionService();
