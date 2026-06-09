import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { NativeBiometric, type BiometricOptions, type BiometryType } from 'capacitor-native-biometric';
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
      description: subtitle,
      negativeButtonText: i18n.global.t('common.cancel'),
      useFallback: false,
      maxAttempts: 5,
    };

    try {
      await NativeBiometric.verifyIdentity(options);
      return true;
    } catch (error) {
      logger.warn('Biometric authentication failed or was cancelled:', error);
      return false;
    }
  }

  async isBiometricEnabled(): Promise<boolean> {
    const result = await Preferences.get({ key: 'biometry-enabled' });
    return result.value === 'true';
  }

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await Preferences.set({
      key: 'biometry-enabled',
      value: enabled ? 'true' : 'false',
    });
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
