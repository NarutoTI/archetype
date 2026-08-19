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
}));

vi.mock('axios', () => ({
  default: hoisted.mockAxios,
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(),
    close: vi.fn(),
  },
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
  useSettingsStore: vi.fn(() => ({
    language: 'pt',
    loadSettings: vi.fn(async () => {}),
    clearUserScopedPreferences: vi.fn(async () => {}),
  })),
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
    setActivePinia(createPinia());

    hoisted.mockAxios.create.mockReturnValue(hoisted.mockAuthAxios);
    hoisted.mockPreferences.get.mockResolvedValue({ value: null });
    hoisted.mockPreferences.set.mockResolvedValue(undefined);
    hoisted.mockPreferences.remove.mockResolvedValue(undefined);
    hoisted.mockTaskStoreReset.mockResolvedValue(undefined);
    hoisted.mockCapacitor.isNativePlatform.mockReturnValue(false);
    hoisted.mockCapacitor.getPlatform.mockReturnValue('web');
    hoisted.mockApp.addListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
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
});
