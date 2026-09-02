import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const preferencesMock = vi.hoisted(() => {
  let store: Record<string, string> = {};
  return {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: store[key] ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => {
      store[key] = value;
    }),
    remove: vi.fn(async ({ key }: { key: string }) => {
      delete store[key];
    }),
    seed: (key: string, value: string) => {
      store[key] = value;
    },
    clearStore: () => {
      store = {};
    },
  };
});

vi.mock('@capacitor/preferences', () => ({
  Preferences: preferencesMock,
}));

/**
 * Plataforma controlável: o formato inicial da barra inferior depende dela (flutuante no
 * app, encostada na web). O jsdom sozinho sempre pareceria web, e o caso do app nunca
 * seria exercitado.
 */
const platformMock = vi.hoisted(() => ({ isNative: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platformMock.isNative },
  SystemBars: { setStyle: vi.fn(async () => {}) },
  SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT' },
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      locale: { value: 'pt' },
      t: vi.fn((key: string) => key),
    },
  },
}));

import { useSettingsStore } from '@/stores/settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    preferencesMock.clearStore();
    vi.clearAllMocks();
    // App é o caso padrão dos specs; quem testa a web liga o contrário explicitamente.
    platformMock.isNative = true;
    document.documentElement.classList.remove('ion-palette-dark');
  });

  it('loadBootSettings() restores language and theme from Preferences', async () => {
    preferencesMock.seed('user-language', 'en');
    preferencesMock.seed('user-theme', 'dark');

    const store = useSettingsStore();
    await store.loadBootSettings();

    expect(store.language).toBe('en');
    expect(store.theme).toBe('dark');
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
  });

  it('setLanguage() persists supported locales only', async () => {
    const store = useSettingsStore();

    await store.setLanguage('en');
    expect(store.language).toBe('en');
    expect(preferencesMock.set).toHaveBeenCalledWith({ key: 'user-language', value: 'en' });

    await store.setLanguage('fr');
    expect(store.language).toBe('en');
  });

  it('loadBootSettings() dedupes concurrent callers', async () => {
    const store = useSettingsStore();
    const first = store.loadBootSettings();
    const second = store.loadBootSettings();

    await Promise.all([first, second]);

    const languageReads = preferencesMock.get.mock.calls.filter(
      ([args]) => args.key === 'user-language',
    ).length;
    const themeReads = preferencesMock.get.mock.calls.filter(
      ([args]) => args.key === 'user-theme',
    ).length;

    expect(languageReads).toBe(1);
    expect(themeReads).toBe(1);
  });

  /**
   * Formato da barra inferior. É preferência **do aparelho** — acompanha a tela e não a
   * conta —, por isso sobrevive ao reset do logout.
   */
  describe('formato da barra inferior', () => {
    it('nasce flutuante no app, onde a altura de tela é o recurso escasso', () => {
      expect(useSettingsStore().bottomBarFloating).toBe(true);
    });

    /**
     * No navegador a pílula só atrapalha: altura sobra, e o ponteiro não gera o gesto que a
     * revela — quem abre a página encontra uma tela sem navegação nenhuma.
     */
    it('nasce encostada na web, onde o gesto que a revela não existe', () => {
      platformMock.isNative = false;

      expect(useSettingsStore().bottomBarFloating).toBe(false);
    });

    it.each([
      ['app', true, 'false', false],
      ['web', false, 'true', true],
    ])('a escolha salva vence o padrão da plataforma (%s)', async (_nome, isNative, salvo, esperado) => {
      platformMock.isNative = isNative;
      preferencesMock.seed('bottom-bar-floating', salvo);

      const store = useSettingsStore();
      await store.loadBootSettings();

      expect(store.bottomBarFloating).toBe(esperado);
    });

    it('persiste a escolha contrária ao padrão', async () => {
      const store = useSettingsStore();
      expect(store.bottomBarFloating).toBe(true);

      await store.setBottomBarFloating(false);

      expect(store.bottomBarFloating).toBe(false);
      expect(preferencesMock.set).toHaveBeenCalledWith({
        key: 'bottom-bar-floating',
        value: 'false',
      });
    });

    /**
     * Precisa estar no boot, e não na carga completa: é ela que decide o layout do primeiro
     * quadro. Chegando depois do mount, quem escolheu a barra encostada vê a pílula
     * flutuante aparecer e o conteúdo pular quando a preferência chega.
     */
    it('carrega a escolha salva já no boot, antes do primeiro quadro', async () => {
      preferencesMock.seed('bottom-bar-floating', 'false');

      const store = useSettingsStore();
      await store.loadBootSettings();

      expect(store.bottomBarFloating).toBe(false);
    });

    it('sobrevive ao reset do logout, que é de dados da conta', async () => {
      const store = useSettingsStore();
      await store.setBottomBarFloating(false);

      await store.reset();

      expect(store.bottomBarFloating).toBe(false);
    });
  });
});
