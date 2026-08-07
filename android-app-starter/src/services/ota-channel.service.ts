import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { logger } from '@/utils/logger';

/** O canal OTA é local do device; não é uma preferência de usuário/servidor. */
export type OtaChannel = 'production' | 'staging';

const OTA_CHANNEL_KEY = 'ota-channel-override';

// Canal inicial bake-time (default produção). A preferência do device vence.
const env = import.meta.env as unknown as Record<string, string | undefined>;
const BAKE_CHANNEL: OtaChannel = env.VITE_OTA_CHANNEL === 'staging' ? 'staging' : 'production';

let cachedChannel: OtaChannel = BAKE_CHANNEL;
let loaded = false;
let loadPromise: Promise<OtaChannel> | null = null;

function normalizeChannel(value: string | null | undefined): OtaChannel {
  if (value === 'staging') return 'staging';
  if (value === 'production') return 'production';
  return BAKE_CHANNEL; // sem preferência local -> usa o bake
}

/**
 * Lê o canal local uma vez por lifetime do app. Ausente/inválido usa o bake;
 * web ou erro de storage caem de forma segura no bake (default produção).
 */
export async function getOtaChannel(): Promise<OtaChannel> {
  if (loaded) return cachedChannel;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    if (!Capacitor.isNativePlatform()) {
      loaded = true;
      return cachedChannel;
    }

    try {
      const result = await Preferences.get({ key: OTA_CHANNEL_KEY });
      cachedChannel = normalizeChannel(result.value);
    } catch (error) {
      logger.error('Falha ao ler o canal OTA local; usando o bake:', error);
      cachedChannel = BAKE_CHANNEL;
    }

    loaded = true;
    return cachedChannel;
  })().finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

/**
 * Persiste o canal local. Grava sempre explicitamente (produção inclusive) para
 * vencer um bake staging; sem isso, sair do teste voltaria pro bake.
 */
export async function setOtaChannel(channel: OtaChannel): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  await Preferences.set({ key: OTA_CHANNEL_KEY, value: channel });

  cachedChannel = channel;
  loaded = true;
}
