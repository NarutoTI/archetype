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

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setStyle: vi.fn(async () => {}),
  },
  Style: {
    Dark: 'DARK',
    Light: 'LIGHT',
  },
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
});
