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
    it('nasce flutuante e persiste a escolha contrária', async () => {
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
