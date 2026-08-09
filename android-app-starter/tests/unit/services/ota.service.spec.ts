import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { CurrentBundleResult } from '@capgo/capacitor-updater';

// Mantém deps nativas/UI fora do caminho — estes testes miram a lógica pura de
// versão e os guards web, não a ponte do plugin.
const h = vi.hoisted(() => ({ native: false }));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native, getPlatform: () => 'web' },
  CapacitorHttp: { get: vi.fn() },
}));
vi.mock('@capgo/capacitor-updater', () => ({
  CapacitorUpdater: {
    current: vi.fn(),
    download: vi.fn(),
    next: vi.fn(),
    set: vi.fn(),
    notifyAppReady: vi.fn().mockResolvedValue({ bundle: {} }),
    reset: vi.fn(),
  },
}));
vi.mock('@/services/alert.service', () => ({ alertService: { presentCustomAlert: vi.fn() } }));
vi.mock('@/services/toast.service', () => ({
  toastService: { presentToastSuccess: vi.fn(), presentToastError: vi.fn() },
}));

import {
  parseOtaVersion,
  isNewerOtaBundle,
  effectiveBundleVersion,
  satisfiesNative,
  formatBundleLabel,
  checkForOtaUpdate,
  notifyAppReady,
  resetToBuiltin,
  sanitizeOtaDescriptor,
} from '@/services/ota.service';

function current(id: string, version: string, native: string): CurrentBundleResult {
  return {
    bundle: { id, version, downloaded: '', checksum: '', status: 'success' },
    native,
  };
}

beforeEach(() => {
  h.native = false;
  vi.clearAllMocks();
});

describe('parseOtaVersion', () => {
  it('faz parse de base + contador ota', () => {
    expect(parseOtaVersion('1.1.0+ota.3')).toEqual([1, 1, 0, 3]);
  });
  it('trata semver puro como ota.0', () => {
    expect(parseOtaVersion('1.2.0')).toEqual([1, 2, 0, 0]);
  });
  it('protege entrada malformada como zeros', () => {
    expect(parseOtaVersion('builtin')).toEqual([0, 0, 0, 0]);
    expect(parseOtaVersion('1.1.0+ota.x')).toEqual([1, 1, 0, 0]);
  });
});

describe('isNewerOtaBundle', () => {
  it('contador ota desempata base igual', () => {
    expect(isNewerOtaBundle('1.1.0+ota.3', '1.1.0+ota.2')).toBe(true);
    expect(isNewerOtaBundle('1.1.0+ota.2', '1.1.0+ota.3')).toBe(false);
  });
  it('base vence o contador ota', () => {
    expect(isNewerOtaBundle('1.2.0+ota.1', '1.1.0+ota.9')).toBe(true);
  });
  it('base-first bloqueia linha web antiga numa casca nativa mais nova', () => {
    expect(isNewerOtaBundle('1.1.0+ota.5', '1.2.0+ota.0')).toBe(false);
  });
  it('igual não é mais novo', () => {
    expect(isNewerOtaBundle('1.1.0+ota.3', '1.1.0+ota.3')).toBe(false);
  });
});

describe('effectiveBundleVersion', () => {
  it('mapeia builtin para <native>+ota.0', () => {
    expect(effectiveBundleVersion(current('builtin', '', '1.1.0'))).toBe('1.1.0+ota.0');
  });
  it('cai no native quando a versão do bundle é vazia', () => {
    expect(effectiveBundleVersion(current('someid', '', '1.1.0'))).toBe('1.1.0+ota.0');
  });
  it('usa a versão do bundle ativo quando presente', () => {
    expect(effectiveBundleVersion(current('id123', '1.1.0+ota.4', '1.1.0'))).toBe('1.1.0+ota.4');
  });
  it('qualquer OTA real é mais novo que um builtin na mesma linha nativa', () => {
    const cur = effectiveBundleVersion(current('builtin', '', '1.1.0'));
    expect(isNewerOtaBundle('1.1.0+ota.1', cur)).toBe(true);
  });
});

describe('satisfiesNative', () => {
  it('passa quando não há minNativeVersion', () => {
    expect(satisfiesNative(undefined, '1.1.0')).toBe(true);
  });
  it('passa quando native >= min', () => {
    expect(satisfiesNative('1.1.0', '1.1.0')).toBe(true);
    expect(satisfiesNative('1.1.0', '1.2.0')).toBe(true);
  });
  it('falha quando native < min', () => {
    expect(satisfiesNative('1.2.0', '1.1.0')).toBe(false);
  });
});

describe('formatBundleLabel', () => {
  it('mostra "base (contador)" para um bundle OTA aplicado', () => {
    expect(formatBundleLabel(current('id1', '1.1.0+ota.3', '1.1.0'))).toBe('1.1.0 (3)');
  });
  it('mostra só o native para o bundle builtin', () => {
    expect(formatBundleLabel(current('builtin', '', '1.1.0'))).toBe('1.1.0');
  });
  it('mostra "(0)" para uma versão de bundle semver puro', () => {
    expect(formatBundleLabel(current('id2', '1.2.0', '1.2.0'))).toBe('1.2.0 (0)');
  });
});

describe('web guards', () => {
  it('checkForOtaUpdate resolve false na web (mesmo com descriptor)', async () => {
    await expect(
      checkForOtaUpdate({ bundleVersion: '1.0.0+ota.1', url: 'https://x/z.zip', checksum: 'sha', minNativeVersion: '1.0.0' }),
    ).resolves.toBe(false);
  });
  it('checkForOtaUpdate resolve false sem descriptor', async () => {
    await expect(checkForOtaUpdate(null)).resolves.toBe(false);
  });
  it('checkForOtaUpdate silencioso também é no-op na web', async () => {
    await expect(
      checkForOtaUpdate({ bundleVersion: '1.0.0+ota.1', url: 'https://x/z.zip', checksum: 'sha', minNativeVersion: '1.0.0' }, { silent: true }),
    ).resolves.toBe(false);
  });
  it('notifyAppReady é no-op na web', async () => {
    await expect(notifyAppReady()).resolves.toBeUndefined();
  });
  it('resetToBuiltin é no-op na web', async () => {
    await expect(resetToBuiltin()).resolves.toBeUndefined();
  });
});

describe('resetToBuiltin', () => {
  it('no nativo chama o reset público do Capgo', async () => {
    h.native = true;
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater');
    await resetToBuiltin();
    expect(CapacitorUpdater.reset).toHaveBeenCalledTimes(1);
  });
});

describe('sanitizeOtaDescriptor', () => {
  const valid = {
    bundleVersion: '1.0.0+ota.2',
    url: 'https://x/z.zip',
    checksum: 'sha',
    minNativeVersion: '1.0.0',
  };
  it('aceita um descriptor bem-formado cuja base casa com a linha nativa', () => {
    expect(sanitizeOtaDescriptor(valid, '1.0.0')).toEqual(valid);
  });
  it('rejeita null / undefined', () => {
    expect(sanitizeOtaDescriptor(null, '1.0.0')).toBeNull();
    expect(sanitizeOtaDescriptor(undefined, '1.0.0')).toBeNull();
  });
  it('rejeita checksum ausente/vazio', () => {
    expect(sanitizeOtaDescriptor({ ...valid, checksum: '' }, '1.0.0')).toBeNull();
  });
  it('rejeita minNativeVersion ausente/em branco', () => {
    expect(sanitizeOtaDescriptor({ ...valid, minNativeVersion: '   ' }, '1.0.0')).toBeNull();
  });
  it('rejeita cola na linha nativa errada (chave != base do bundle)', () => {
    expect(sanitizeOtaDescriptor(valid, '1.0.1')).toBeNull();
  });
});
