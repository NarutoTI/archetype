import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado mutável dos mocks via vi.hoisted (as factories de vi.mock são içadas
// acima dos imports, então não podem referenciar top-level vars comuns).
const h = vi.hoisted(() => ({ native: true, prefs: {} as Record<string, string> }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async ({ key }: { key: string }) => ({ value: h.prefs[key] ?? null })),
    set: vi.fn(async ({ key, value }: { key: string; value: string }) => { h.prefs[key] = value; }),
    remove: vi.fn(async ({ key }: { key: string }) => { delete h.prefs[key]; }),
  },
}));

beforeEach(() => {
  h.native = true;
  for (const k of Object.keys(h.prefs)) delete h.prefs[k];
  vi.resetModules(); // getOtaChannel cacheia 1x por lifetime -> módulo fresco por teste
});

describe('ota-channel.service', () => {
  it('default é production sem preferência local', async () => {
    const { getOtaChannel } = await import('@/services/ota-channel.service');
    await expect(getOtaChannel()).resolves.toBe('production');
  });

  it('lê staging quando persistido em Preferences', async () => {
    h.prefs['ota-channel-override'] = 'staging';
    const { getOtaChannel } = await import('@/services/ota-channel.service');
    await expect(getOtaChannel()).resolves.toBe('staging');
  });

  it('setOtaChannel(staging) persiste e passa a ler staging', async () => {
    const mod = await import('@/services/ota-channel.service');
    await mod.setOtaChannel('staging');
    expect(h.prefs['ota-channel-override']).toBe('staging');
    await expect(mod.getOtaChannel()).resolves.toBe('staging');
  });

  it('setOtaChannel(production) grava production explicitamente (vence bake staging)', async () => {
    h.prefs['ota-channel-override'] = 'staging';
    const mod = await import('@/services/ota-channel.service');
    await mod.setOtaChannel('production');
    expect(h.prefs['ota-channel-override']).toBe('production');
    await expect(mod.getOtaChannel()).resolves.toBe('production');
  });

  it('na web usa o bake (production) e não grava nada', async () => {
    h.native = false;
    const mod = await import('@/services/ota-channel.service');
    await mod.setOtaChannel('staging');
    expect(h.prefs['ota-channel-override']).toBeUndefined();
    await expect(mod.getOtaChannel()).resolves.toBe('production');
  });
});
