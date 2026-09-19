import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const hoisted = vi.hoisted(() => ({
  mockAuthAxios: {
    post: vi.fn(),
  },
  mockAxios: {
    create: vi.fn(),
  },
  mockPreferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
  mockTaskStoreReset: vi.fn(async () => {}),
  mockCapacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
  mockApp: {
    addListener: vi.fn(),
  },
  mockBrowser: {
    open: vi.fn(),
    close: vi.fn(),
  },
  mockSocialLogin: {
    initialize: vi.fn(),
    login: vi.fn(),
  },
  mockSettingsStore: {
    language: 'pt',
    loadSettings: vi.fn(async () => {}),
    clearUserScopedPreferences: vi.fn(async () => {}),
  },
}));

vi.mock('axios', () => ({
  default: hoisted.mockAxios,
}));

vi.mock('@capacitor/browser', () => ({
  Browser: hoisted.mockBrowser,
}));

vi.mock('@capgo/capacitor-social-login', () => ({
  SocialLogin: hoisted.mockSocialLogin,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: hoisted.mockCapacitor,
}));

vi.mock('@capacitor/app', () => ({
  App: hoisted.mockApp,
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: hoisted.mockPreferences,
}));

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: vi.fn(() => ({
    reset: hoisted.mockTaskStoreReset,
  })),
}));

vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: vi.fn(() => hoisted.mockSettingsStore),
}));

vi.mock('@/services/errorTranslation.service', () => ({
  ErrorTranslationService: {
    translateError: vi.fn((error: { message?: string }) => error?.message || 'error'),
    translateSuccess: vi.fn((data: { message?: string }) => data?.message || 'ok'),
  },
}));

// O `signOut()` importa este serviço dinamicamente e só precisa que ele termine. Sem o
// dublê, a cadeia real entra junto (reminderDelivery, push nativo, localNotification) e o
// teste passa segundos ali dentro — o que estourava o limite de 5s no run completo, embora
// passasse isolado. Aqui a fronteira é autenticação; push tem spec próprio.
vi.mock('@/services/pushNotification.service', () => ({
  pushNotificationService: {
    unregisterBeforeLogout: vi.fn(async () => {}),
  },
}));

const buildToken = (payload: Record<string, unknown>) => {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.signature`;
};

describe('authService', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', 'web-client-id.apps.googleusercontent.com');
    setActivePinia(createPinia());

    hoisted.mockAxios.create.mockReturnValue(hoisted.mockAuthAxios);
    hoisted.mockPreferences.get.mockResolvedValue({ value: null });
    hoisted.mockPreferences.set.mockResolvedValue(undefined);
    hoisted.mockPreferences.remove.mockResolvedValue(undefined);
    hoisted.mockTaskStoreReset.mockResolvedValue(undefined);
    hoisted.mockCapacitor.isNativePlatform.mockReturnValue(false);
    hoisted.mockCapacitor.getPlatform.mockReturnValue('web');
    hoisted.mockApp.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
    hoisted.mockBrowser.open.mockResolvedValue(undefined);
    hoisted.mockBrowser.close.mockResolvedValue(undefined);
    // Padrão: seletor indisponível, como num AAB sem o plugin — cai no Custom Tab.
    hoisted.mockSocialLogin.initialize.mockResolvedValue(undefined);
    hoisted.mockSocialLogin.login.mockRejectedValue(new Error('plugin unavailable'));
    hoisted.mockSettingsStore.loadSettings.mockResolvedValue(undefined);
    hoisted.mockSettingsStore.clearUserScopedPreferences.mockResolvedValue(undefined);
  });

  it('initializeAuth() restores the current user from a saved token', async () => {
    const token = buildToken({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      provider: 'email',
    });
    hoisted.mockPreferences.get.mockResolvedValueOnce({ value: token });

    const { authService } = await import('@/services/auth.service');
    const { useUserStore } = await import('@/stores/userStore');

    await authService.initializeAuth();

    expect(useUserStore().currentUser).toEqual(expect.objectContaining({
      id: 'user-1',
      email: 'user@example.com',
    }));
  });

  it('loginWithEmail() stores the token and resets user-scoped stores', async () => {
    hoisted.mockAuthAxios.post.mockResolvedValueOnce({
      data: {
        success: true,
        token: 'jwt-token',
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'User',
          provider: 'email',
        },
      },
    });

    const { authService } = await import('@/services/auth.service');
    const user = await authService.loginWithEmail('user@example.com', 'secret');

    expect(hoisted.mockPreferences.set).toHaveBeenCalledWith({
      key: 'auth_token',
      value: 'jwt-token',
    });
    expect(hoisted.mockTaskStoreReset).toHaveBeenCalledWith({ removePersisted: false });
    expect(user.id).toBe('user-1');
  });

  it('signOut() removes the token and clears the current user', async () => {
    const { authService } = await import('@/services/auth.service');
    const { useUserStore } = await import('@/stores/userStore');

    useUserStore().setCurrentUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      provider: 'email',
    });

    await authService.signOut();

    expect(hoisted.mockPreferences.remove).toHaveBeenCalledWith({ key: 'auth_token' });
    expect(useUserStore().currentUser).toBeNull();
  });

  it('signOut() still clears the token when removing the deep-link listener fails', async () => {
    hoisted.mockCapacitor.isNativePlatform.mockReturnValue(true);
    const remove = vi.fn().mockRejectedValue(new Error('listener already detached'));
    hoisted.mockApp.addListener.mockResolvedValue({ remove });

    const { authService } = await import('@/services/auth.service');
    const { useUserStore } = await import('@/stores/userStore');

    useUserStore().setCurrentUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      provider: 'email',
    });

    await expect(authService.signInWithGoogle()).rejects.toThrow('REDIRECT_PENDING');

    await expect(authService.signOut()).resolves.toBeUndefined();

    expect(remove).toHaveBeenCalledOnce();
    expect(hoisted.mockPreferences.remove).toHaveBeenCalledWith({ key: 'auth_token' });
    expect(useUserStore().currentUser).toBeNull();

    // O handle quebrado não pode ficar retido: o segundo logout não tenta remover de novo.
    await authService.signOut();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('signOut() clears the current user even if the user-scoped cleanup fails', async () => {
    hoisted.mockSettingsStore.clearUserScopedPreferences.mockRejectedValue(
      new Error('preferences unavailable')
    );

    const { authService } = await import('@/services/auth.service');
    const { useUserStore } = await import('@/stores/userStore');

    useUserStore().setCurrentUser({
      id: 'user-1',
      email: 'user@example.com',
      name: 'User',
      provider: 'email',
    });

    await expect(authService.signOut()).resolves.toBeUndefined();

    expect(hoisted.mockPreferences.remove).toHaveBeenCalledWith({ key: 'auth_token' });
    // Sem isto o app fica com isAuthenticated true e sem token: 401 mudo, sem volta ao /login.
    expect(useUserStore().currentUser).toBeNull();
  });

  describe('native Google sign-in', () => {
    /** Resposta do seletor nativo em modo `online`. */
    const nativePickerResult = {
      provider: 'google',
      result: {
        responseType: 'online',
        idToken: 'google-id-token',
        accessToken: null,
        profile: { email: 'user@example.com', name: 'User' },
      },
    };

    beforeEach(() => {
      hoisted.mockCapacitor.isNativePlatform.mockReturnValue(true);
      hoisted.mockCapacitor.getPlatform.mockReturnValue('android');
    });

    it('exchanges the ID token for the app JWT without opening the browser', async () => {
      hoisted.mockSocialLogin.login.mockResolvedValue(nativePickerResult);
      hoisted.mockAuthAxios.post.mockResolvedValueOnce({
        data: {
          success: true,
          token: 'jwt-token',
          user: { id: 'user-1', email: 'user@example.com', name: 'User', provider: 'google' },
        },
      });

      const { authService } = await import('@/services/auth.service');
      const loginSuccess = vi.fn();
      authService.onLoginGoogleSuccess(loginSuccess);

      const user = await authService.signInWithGoogle();

      // Sem `scopes`: com eles o plugin rejeita no Android se a MainActivity não for
      // modificada — e o fallback esconderia isso para sempre.
      expect(hoisted.mockSocialLogin.login).toHaveBeenCalledWith({
        provider: 'google',
        options: {},
      });
      expect(hoisted.mockAuthAxios.post).toHaveBeenCalledWith('/auth/google/native', {
        idToken: 'google-id-token',
        language: 'pt',
      });
      expect(hoisted.mockBrowser.open).not.toHaveBeenCalled();
      expect(hoisted.mockPreferences.set).toHaveBeenCalledWith({
        key: 'auth_token',
        value: 'jwt-token',
      });
      // A LoginPage navega pelo retorno; emitir aqui faria o `goAfterLogin` rodar duas vezes.
      expect(loginSuccess).not.toHaveBeenCalled();
      expect(user.id).toBe('user-1');
    });

    it('does not fall back to the browser when the user dismisses the picker', async () => {
      const cancelled = Object.assign(new Error('The user canceled the sign-in flow'), {
        code: 'USER_CANCELLED',
      });
      hoisted.mockSocialLogin.login.mockRejectedValue(cancelled);

      const { authService } = await import('@/services/auth.service');

      await expect(authService.signInWithGoogle()).rejects.toMatchObject({
        code: 'USER_CANCELLED',
      });
      expect(hoisted.mockBrowser.open).not.toHaveBeenCalled();
      expect(hoisted.mockAuthAxios.post).not.toHaveBeenCalled();
    });

    it('does not fall back to the browser when the backend rejects the ID token', async () => {
      hoisted.mockSocialLogin.login.mockResolvedValue(nativePickerResult);
      // Ex.: 403 EMAIL_NOT_VERIFIED, ou 401 por GOOGLE_CLIENT_ID diferente do client web.
      hoisted.mockAuthAxios.post.mockRejectedValueOnce(
        Object.assign(new Error('Google has not verified this email address'), {
          response: { status: 403, data: { success: false, code: 'EMAIL_NOT_VERIFIED' } },
        })
      );

      const { authService } = await import('@/services/auth.service');

      await expect(authService.signInWithGoogle()).rejects.toThrow(
        'Google has not verified this email address'
      );
      // O Custom Tab contornaria o `email_verified` e esconderia erro de configuração.
      expect(hoisted.mockApp.addListener).not.toHaveBeenCalled();
      expect(hoisted.mockBrowser.open).not.toHaveBeenCalled();
      expect(hoisted.mockPreferences.set).not.toHaveBeenCalled();
    });

    it('falls back to the Custom Tab when the native picker fails', async () => {
      // Ex.: aparelho sem Google Play Services, ou client Android sem o SHA-1.
      hoisted.mockSocialLogin.login.mockRejectedValue(new Error('DEVELOPER_ERROR'));

      const { authService } = await import('@/services/auth.service');

      await expect(authService.signInWithGoogle()).rejects.toThrow('REDIRECT_PENDING');
      expect(hoisted.mockBrowser.open).toHaveBeenCalledWith({
        url: expect.stringContaining('/auth/google?mobile=true&language=pt'),
      });
    });

    it('uses only the Custom Tab while the web client ID is not configured', async () => {
      // Estado de fábrica do starter: sem projeto no Google Cloud, o seletor fica fora.
      vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', '');
      hoisted.mockSocialLogin.login.mockResolvedValue(nativePickerResult);

      const { authService } = await import('@/services/auth.service');

      await expect(authService.signInWithGoogle()).rejects.toThrow('REDIRECT_PENDING');
      expect(hoisted.mockSocialLogin.initialize).not.toHaveBeenCalled();
      expect(hoisted.mockSocialLogin.login).not.toHaveBeenCalled();
      expect(hoisted.mockBrowser.open).toHaveBeenCalled();
    });
  });
});
