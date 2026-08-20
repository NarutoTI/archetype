import { defineStore } from 'pinia';
import { ref } from 'vue';
import { Preferences as CapacitorPreferences } from '@capacitor/preferences';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import i18n from '@/i18n';
import { logger } from '@/utils/logger';
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type Preferences as AppPreferences,
} from '@/types/Preferences';

export type ThemeOption = 'system' | 'light' | 'dark';

/** Formato da barra inferior. Preferência do aparelho — ver `bottomBarFloating`. */
export const BOTTOM_BAR_FLOATING_PREFERENCE_KEY = 'bottom-bar-floating';

const SUPPORTED_LOCALES = ['pt', 'en'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

const isSupportedLocale = (value: string): value is SupportedLocale => {
  return SUPPORTED_LOCALES.includes(value as SupportedLocale);
};

export const useSettingsStore = defineStore('settings', () => {
  let bootSettingsLoaded = false;
  let bootSettingsPromise: Promise<void> | null = null;
  let fullSettingsPromise: Promise<void> | null = null;

  const language = ref<SupportedLocale>('pt');
  const theme = ref<ThemeOption>('system');
  const biometryEnabled = ref(false);
  /** Barra inferior flutuante (pílula solta sobre o conteúdo). Padrão do app. */
  const bottomBarFloating = ref(true);
  const preferences = ref<AppPreferences>(normalizePreferences());

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');

  const applyTheme = (option: ThemeOption) => {
    const shouldUseDark =
      option === 'dark' || (option === 'system' && prefersDark.matches);
    document.documentElement.classList.toggle('ion-palette-dark', shouldUseDark);
  };

  const syncStatusBar = async () => {
    try {
      const isDark = document.documentElement.classList.contains('ion-palette-dark');
      // Aplica nas duas barras (status e navegação) — sem filtro `bar`.
      await SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
    } catch {
      // SystemBars só existe nas plataformas nativas.
    }
  };

  const setLanguage = async (value: string) => {
    if (!isSupportedLocale(value)) return;
    language.value = value;
    i18n.global.locale.value = value;
    await CapacitorPreferences.set({ key: 'user-language', value });
  };

  const setTheme = async (value: ThemeOption) => {
    theme.value = value;
    applyTheme(value);
    await syncStatusBar();
    await CapacitorPreferences.set({ key: 'user-theme', value });
  };

  const setBiometryEnabled = async (enabled: boolean) => {
    biometryEnabled.value = enabled;
    await CapacitorPreferences.set({
      key: 'biometry-enabled',
      value: enabled ? 'true' : 'false',
    });
  };

  const setBottomBarFloating = async (floating: boolean) => {
    bottomBarFloating.value = floating;
    await CapacitorPreferences.set({
      key: BOTTOM_BAR_FLOATING_PREFERENCE_KEY,
      value: floating ? 'true' : 'false',
    });
  };

  const setPreferences = (payload: Partial<AppPreferences>) => {
    preferences.value = normalizePreferences({
      ...preferences.value,
      ...payload,
    });
  };

  const loadLanguageAndThemeSettings = async () => {
    const [savedLanguage, savedTheme] = await Promise.all([
      CapacitorPreferences.get({ key: 'user-language' }),
      CapacitorPreferences.get({ key: 'user-theme' }),
    ]);

    if (savedLanguage.value && isSupportedLocale(savedLanguage.value)) {
      language.value = savedLanguage.value;
      i18n.global.locale.value = savedLanguage.value;
    } else {
      const currentLocale = String(i18n.global.locale.value);
      language.value = isSupportedLocale(currentLocale) ? currentLocale : 'pt';
    }

    theme.value =
      savedTheme.value === 'light' || savedTheme.value === 'dark' || savedTheme.value === 'system'
        ? savedTheme.value
        : 'system';

    applyTheme(theme.value);
    prefersDark.addEventListener('change', () => {
      if (theme.value === 'system') {
        applyTheme('system');
        void syncStatusBar();
      }
    });
    await syncStatusBar();
  };

  /**
   * Fica no boot, e não na carga completa, porque decide o layout do primeiro quadro: lida
   * depois do mount, quem escolheu a barra encostada vê a pílula flutuante aparecer e o
   * conteúdo pular quando a preferência chega.
   */
  const loadBottomBarPreference = async () => {
    const saved = await CapacitorPreferences.get({ key: BOTTOM_BAR_FLOATING_PREFERENCE_KEY });
    if (saved.value) {
      bottomBarFloating.value = saved.value === 'true';
    }
  };

  const loadBootSettings = async () => {
    if (bootSettingsLoaded) return;
    if (bootSettingsPromise) return bootSettingsPromise;

    bootSettingsPromise = (async () => {
      await loadLanguageAndThemeSettings();
      await loadBottomBarPreference();
      bootSettingsLoaded = true;
    })();

    try {
      await bootSettingsPromise;
    } finally {
      bootSettingsPromise = null;
    }
  };

  const loadSettings = async () => {
    await loadBootSettings();
    if (fullSettingsPromise) return fullSettingsPromise;

    fullSettingsPromise = (async () => {
      const savedBiometry = await CapacitorPreferences.get({ key: 'biometry-enabled' });
      biometryEnabled.value = savedBiometry.value === 'true';
      preferences.value = normalizePreferences(DEFAULT_PREFERENCES);
      logger.log('Settings loaded', {
        language: language.value,
        theme: theme.value,
        biometryEnabled: biometryEnabled.value,
      });
    })();

    try {
      await fullSettingsPromise;
    } finally {
      fullSettingsPromise = null;
    }
  };

  const clearUserScopedPreferences = async () => {
    // Gancho de projeto gerado (tema/idioma/biometria do aparelho ficam). Logout chama isto com currentUser setado — não reordenar no clearToken.
  };

  // `bottomBarFloating` fica de fora de propósito: é escolha do aparelho, acompanha a tela e
  // não a conta, então sobrevive ao logout.
  const reset = async () => {
    language.value = 'pt';
    theme.value = 'system';
    biometryEnabled.value = false;
    preferences.value = normalizePreferences();

    await Promise.all([
      CapacitorPreferences.remove({ key: 'user-language' }),
      CapacitorPreferences.remove({ key: 'user-theme' }),
      CapacitorPreferences.remove({ key: 'biometry-enabled' }),
    ]);

    i18n.global.locale.value = 'pt';
    applyTheme('system');
    await syncStatusBar();
  };

  return {
    language,
    theme,
    biometryEnabled,
    bottomBarFloating,
    preferences,
    setLanguage,
    setTheme,
    setBiometryEnabled,
    setBottomBarFloating,
    setPreferences,
    loadBootSettings,
    loadSettings,
    clearUserScopedPreferences,
    reset,
  };
});
