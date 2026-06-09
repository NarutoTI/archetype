import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import axios from 'axios';
import type { User } from '@/types/User';
import { ErrorTranslationService } from '@/services/errorTranslation.service';
import { useSettingsStore } from '@/stores/settingsStore';
import { useUserStore } from '@/stores/userStore';
import { bootReadyPromise } from '@/services/boot';
import { logger } from '@/utils/logger';

export const AUTH_ACTIONS = {
  EMAIL_CONFIRMED: 'email_confirmed',
  AUTH_TOKEN: 'auth_token',
  PASSWORD_RESET_READY: 'password_reset_ready',
  EMAIL_ALREADY_VERIFIED: 'email_already_verified',
  ACCOUNT_DELETED: 'account_deleted',
} as const;

class AuthService {
  private loginGoogleSuccessCallbacks: Array<() => void> = [];
  private backendUrl = import.meta.env.VITE_API_URL || 'http://10.0.2.2:3000';
  private deepLinkScheme = import.meta.env.VITE_DEEP_LINK_SCHEME || 'androidstarter';
  private deepLinkHost = import.meta.env.VITE_DEEP_LINK_HOST || 'auth';
  private deepLinkListenerSetup = false;
  private deepLinkListener: { remove: () => Promise<void> } | null = null;
  private deepLinkListenerSetupPromise: Promise<void> | null = null;
  private processedTokens = new Set<string>();

  private authAxios = axios.create({
    baseURL: this.backendUrl,
  });

  async initializeAuth(): Promise<void> {
    try {
      const result = await Preferences.get({ key: 'auth_token' });
      if (result.value) {
        this.setCurrentUserFromPayload(this.decodeJWT(result.value));
      }
    } catch (error) {
      logger.error('Auth initialization error:', error);
    }
  }

  private decodeJWT(token: string): Record<string, unknown> {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
          .join(''),
      );
      return JSON.parse(jsonPayload);
    } catch {
      return {};
    }
  }

  private async storeToken(token: string) {
    await Preferences.set({ key: 'auth_token', value: token });
  }

  private async finalizeAuthenticatedSession(token: string, payload: Record<string, unknown>): Promise<User> {
    await this.storeToken(token);
    const user = this.setCurrentUserFromPayload(payload);
    await useSettingsStore().loadSettings();
    return user;
  }

  private async clearToken() {
    await Preferences.remove({ key: 'auth_token' });
    await useSettingsStore().clearUserScopedPreferences();
    useUserStore().setCurrentUser(null);
  }

  onLoginGoogleSuccess(callback: () => void) {
    this.loginGoogleSuccessCallbacks.push(callback);
  }

  removeLoginGoogleSuccessCallback(callback: () => void) {
    const index = this.loginGoogleSuccessCallbacks.indexOf(callback);
    if (index >= 0) this.loginGoogleSuccessCallbacks.splice(index, 1);
  }

  private emitLoginGoogleSuccess() {
    this.loginGoogleSuccessCallbacks.forEach((callback) => callback());
  }

  async signInWithGoogle(): Promise<User> {
    if (import.meta.env.VITE_USE_FAKE_LOGIN === 'true') {
      return this.fakeLogin();
    }

    const settingsStore = useSettingsStore();
    const language = settingsStore.language || 'en';
    const isMobile = Capacitor.isNativePlatform();
    const queryParams = isMobile
      ? `?mobile=true&language=${language}`
      : `?language=${language}`;
    const oauthUrl = `${this.backendUrl}/auth/google${queryParams}`;

    if (isMobile) {
      await this.setupDeepLinkListener();
      try {
        await Browser.open({ url: oauthUrl });
      } catch (error) {
        await this.cleanupDeepLinkListener();
        throw error;
      }
    } else {
      window.location.href = oauthUrl;
    }

    throw new Error('REDIRECT_PENDING');
  }

  private async closeBrowserSafely() {
    try {
      await Browser.close();
    } catch {
      // Browser may already be closed.
    }
  }

  private async setupDeepLinkListener(): Promise<void> {
    if (this.deepLinkListenerSetup) return;
    if (this.deepLinkListenerSetupPromise) return this.deepLinkListenerSetupPromise;

    this.deepLinkListenerSetupPromise = (async () => {
      const { App } = await import('@capacitor/app');
      this.deepLinkListener = await App.addListener('appUrlOpen', async (data) => {
        try {
          const url = new URL(data.url);
          if (url.protocol !== `${this.deepLinkScheme}:` || url.host !== this.deepLinkHost) {
            return;
          }

          const token = url.searchParams.get('token');
          const error = url.searchParams.get('error');
          const success = url.searchParams.get('success');

          if (error) throw new Error(`OAuth error: ${error}`);
          if (!token || success === 'false') return;

          const result = await this.handleOAuthCallback(token);
          if (!result.success) throw new Error(result.message || 'OAuth callback failed');

          if (
            result.action === AUTH_ACTIONS.AUTH_TOKEN ||
            result.action === AUTH_ACTIONS.EMAIL_CONFIRMED
          ) {
            this.emitLoginGoogleSuccess();
          }

          await this.closeBrowserSafely();
          await this.cleanupDeepLinkListener();
        } catch (error) {
          logger.error('Deep link error:', error);
          await this.closeBrowserSafely();
          await this.cleanupDeepLinkListener();
        }
      });

      this.deepLinkListenerSetup = true;
    })();

    try {
      await this.deepLinkListenerSetupPromise;
    } finally {
      this.deepLinkListenerSetupPromise = null;
    }
  }

  private async cleanupDeepLinkListener() {
    if (!this.deepLinkListener || !this.deepLinkListenerSetup) return;
    await this.deepLinkListener.remove();
    this.deepLinkListener = null;
    this.deepLinkListenerSetup = false;
  }

  async handleOAuthCallback(token: string): Promise<{
    success: boolean;
    message?: string;
    action?: string;
    user?: User | null;
  }> {
    const tokenHash = token.substring(0, 20);
    if (this.processedTokens.has(tokenHash)) {
      throw new Error('TOKEN_ALREADY_PROCESSED');
    }
    this.processedTokens.add(tokenHash);

    try {
      const response = await this.authAxios.post('/auth/process-token', { token });
      const data = response.data;

      if (!data.success) {
        return {
          success: false,
          message: ErrorTranslationService.translateError(data),
          action: 'error',
          user: null,
        };
      }

      if (data.action === AUTH_ACTIONS.PASSWORD_RESET_READY || data.action === AUTH_ACTIONS.ACCOUNT_DELETED) {
        return {
          success: true,
          message: ErrorTranslationService.translateSuccess(data),
          action: data.action,
          user: null,
        };
      }

      const user = await this.finalizeAuthenticatedSession(data.token || token, data.user);
      setTimeout(() => this.processedTokens.delete(tokenHash), 30000);
      return {
        success: true,
        message: ErrorTranslationService.translateSuccess(data),
        action: data.action || AUTH_ACTIONS.AUTH_TOKEN,
        user,
      };
    } catch (error) {
      this.processedTokens.delete(tokenHash);
      await this.clearToken().catch(() => {});
      return {
        success: false,
        message: ErrorTranslationService.translateError(error),
        action: 'error',
        user: null,
      };
    }
  }

  async fakeLogin(): Promise<User> {
    const response = await this.authAxios.post('/auth/fake-login');
    return this.finalizeAuthenticatedSession(response.data.token, response.data.user);
  }

  async registerWithEmail(name: string, email: string, password: string, birthDate?: string, phone?: string) {
    try {
      const response = await this.authAxios.post('/auth/register', {
        name,
        email,
        password,
        birthDate,
        phone,
        language: useSettingsStore().language || 'en',
      });

      const data = response.data;
      return data.success
        ? { success: true, message: ErrorTranslationService.translateSuccess(data), user: data.user }
        : { success: false, message: ErrorTranslationService.translateError(data) };
    } catch (error) {
      return { success: false, message: ErrorTranslationService.translateError(error) };
    }
  }

  async loginWithEmail(email: string, password: string): Promise<User> {
    try {
      const response = await this.authAxios.post('/auth/login', { email, password });
      const data = response.data;
      if (!data.success) throw new Error(ErrorTranslationService.translateError(data));
      return this.finalizeAuthenticatedSession(data.token, data.user);
    } catch (error) {
      throw new Error(ErrorTranslationService.translateError(error));
    }
  }

  async forgotPassword(email: string) {
    try {
      const response = await this.authAxios.post('/auth/forgot-password', {
        email,
        language: useSettingsStore().language || 'en',
      });
      return {
        success: response.data.success,
        message: ErrorTranslationService.translateSuccess(response.data),
      };
    } catch (error) {
      return { success: false, message: ErrorTranslationService.translateError(error) };
    }
  }

  async resetPassword(token: string, newPassword: string) {
    try {
      const response = await this.authAxios.post('/auth/reset-password', { token, newPassword });
      return {
        success: response.data.success,
        message: ErrorTranslationService.translateSuccess(response.data),
      };
    } catch (error) {
      return { success: false, message: ErrorTranslationService.translateError(error) };
    }
  }

  async resendConfirmationEmail(email: string) {
    try {
      const response = await this.authAxios.post('/auth/resend-confirmation', {
        email,
        language: useSettingsStore().language || 'en',
      });
      return {
        success: response.data.success,
        message: ErrorTranslationService.translateSuccess(response.data),
      };
    } catch (error) {
      return { success: false, message: ErrorTranslationService.translateError(error) };
    }
  }

  async requestAccountDeletion(): Promise<{ success: boolean; message: string }> {
    try {
      const token = await Preferences.get({ key: 'auth_token' });
      const response = await this.authAxios.post('/auth/delete-account-request', {
        token: token.value || '',
        language: useSettingsStore().language || 'en',
      });
      return {
        success: true,
        message: response.data.message,
      };
    } catch (error) {
      return {
        success: false,
        message: ErrorTranslationService.translateError(error),
      };
    }
  }

  async signOut(): Promise<void> {
    await this.cleanupDeepLinkListener();
    await this.clearToken();
  }

  async isAuthenticated(): Promise<boolean> {
    await bootReadyPromise;
    return useUserStore().isAuthenticated;
  }

  getPlatformInfo() {
    return {
      isMobile: Capacitor.isNativePlatform(),
      platform: Capacitor.getPlatform(),
      strategy: 'http',
    };
  }

  private setCurrentUserFromPayload(payload: Record<string, any>): User {
    const user: User = {
      id: String(payload.id || ''),
      email: String(payload.email || ''),
      name: String(payload.name || payload.email || ''),
      picture: payload.picture || '',
      provider: String(payload.provider || 'email'),
      isDevelopment: payload.provider === 'fake',
      language: payload.language,
      birthDate: payload.birthDate,
      phone: payload.phone,
    };
    useUserStore().setCurrentUser(user);
    return user;
  }
}

export const authService = new AuthService();
