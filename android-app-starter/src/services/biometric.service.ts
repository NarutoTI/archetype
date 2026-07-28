import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import {
  BiometricAuthError,
  BiometryType,
  NativeBiometric,
  type BiometricOptions,
} from '@capgo/capacitor-native-biometric';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';

class BiometricService {
  private isAvailableCache: boolean | null = null;
  private biometryTypeCache: BiometryType | null = null;

  async isAvailable(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;
    if (this.isAvailableCache !== null) return this.isAvailableCache;

    try {
      const result = await NativeBiometric.isAvailable();
      this.isAvailableCache = result.isAvailable;
      this.biometryTypeCache = result.biometryType;
      return result.isAvailable;
    } catch (error) {
      logger.error('Biometric availability check failed:', error);
      this.isAvailableCache = false;
      return false;
    }
  }

  async getBiometryType(): Promise<BiometryType | null> {
    if (this.biometryTypeCache !== null) return this.biometryTypeCache;
    try {
      const result = await NativeBiometric.isAvailable();
      this.biometryTypeCache = result.biometryType;
      return result.biometryType;
    } catch {
      return null;
    }
  }

  async authenticate(
    reason = 'Authentication required',
    title?: string,
    subtitle?: string,
  ): Promise<boolean> {
    if (!(await this.isAvailable())) return false;

    const options: BiometricOptions = {
      reason,
      title,
      subtitle,
      // `description` fica de fora de propósito: o diálogo nativo desenha subtitle e
      // description em linhas separadas, então repetir o subtitle imprimia o texto duas vezes.
      //
      // Permitir DEVICE_CREDENTIAL troca o botão cancelar pelo botão de PIN/padrão/senha do
      // sistema — o BiometricPrompt não aceita os dois juntos. MULTIPLE mantém todas as
      // classes de biometria cadastradas; combinar DEVICE_CREDENTIAL só com FINGERPRINT
      // gera uma combinação que o androidx.biometric rejeita nas APIs 28-29.
      // `negativeButtonText` sai pelo mesmo motivo: não existe mais botão negativo.
      allowedBiometryTypes: [BiometryType.MULTIPLE, BiometryType.DEVICE_CREDENTIAL],
      // Equivalente no iOS: oferece o passcode do aparelho (lá o cancelar continua existindo).
      useFallback: true,
      maxAttempts: 5,
    };

    try {
      await NativeBiometric.verifyIdentity(options);
      return true;
    } catch (error) {
      // No Android o código chega como String num extra do Intent; no iOS, como número.
      const code = Number((error as { code?: unknown })?.code);

      if (
        code === BiometricAuthError.USER_CANCEL ||
        code === BiometricAuthError.USER_FALLBACK ||
        code === BiometricAuthError.APP_CANCEL ||
        code === BiometricAuthError.SYSTEM_CANCEL
      ) {
        logger.log('Biometric authentication cancelled or interrupted');
      } else if (
        code === BiometricAuthError.AUTHENTICATION_FAILED ||
        code === BiometricAuthError.USER_LOCKOUT ||
        code === BiometricAuthError.USER_TEMPORARY_LOCKOUT
      ) {
        logger.warn('Biometric authentication rejected or locked out');
      } else if (
        code === BiometricAuthError.BIOMETRICS_UNAVAILABLE ||
        code === BiometricAuthError.BIOMETRICS_NOT_ENROLLED ||
        code === BiometricAuthError.PASSCODE_NOT_SET
      ) {
        // Estado do aparelho, não falha operacional. Normalmente já filtrado por isAvailable().
        logger.warn('Biometric unavailable or not enrolled on this device');
      } else {
        logger.error('Biometric authentication failed:', error);
      }

      return false;
    }
  }

  async checkBiometricAuth(): Promise<boolean> {
    try {
      const [tokenResult, biometryEnabledResult] = await Promise.all([
        Preferences.get({ key: 'auth_token' }),
        Preferences.get({ key: 'biometry-enabled' }),
      ]);

      if (!tokenResult.value || biometryEnabledResult.value !== 'true') {
        return false;
      }

      if (!(await this.isAvailable())) return false;

      const authenticated = await this.authenticate(
        i18n.global.t('biometric.authenticateToLogin'),
        i18n.global.t('biometric.authenticationRequired'),
        i18n.global.t('biometric.authenticatePrompt'),
      );

      if (!authenticated) {
        await Preferences.remove({ key: 'auth_token' });
        return false;
      }

      return true;
    } catch (error) {
      logger.error('Error during biometric check:', error);
      return false;
    }
  }

  resetCache(): void {
    this.isAvailableCache = null;
    this.biometryTypeCache = null;
  }
}

export const biometricService = new BiometricService();
