import { describe, it, expect, vi, beforeEach } from 'vitest';

// Estado mutável dos mocks (factories de vi.mock são içadas -> usar vi.hoisted).
const h = vi.hoisted(() => ({
  platform: 'android' as string,
  version: '1.0.0',
  payload: null as unknown,
  alertRole: 'cancel' as string,
  channel: 'production' as string,
  otaShownReturn: false,
  otaCalls: [] as Array<{ opts: { silent?: boolean } | undefined }>,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => h.platform,
    isNativePlatform: () => h.platform !== 'web',
  },
}));
vi.mock('@capacitor/app', () => ({
  App: { getInfo: vi.fn(async () => ({ version: h.version })) },
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn() } }));
vi.mock('@/services/api.service', () => ({
  default: { get: vi.fn(async () => ({ data: h.payload })) },
}));
vi.mock('@/services/alert.service', () => ({
  alertService: { presentCustomAlert: vi.fn(async () => ({ role: h.alertRole })) },
}));
vi.mock('@/services/toast.service', () => ({
  toastService: { presentToastSuccess: vi.fn(), presentToastError: vi.fn() },
}));
vi.mock('@/services/ota-channel.service', () => ({
  getOtaChannel: vi.fn(async () => h.channel),
}));
vi.mock('@/services/ota.service', () => ({
  sanitizeOtaDescriptor: (raw: unknown) => raw ?? null,
  checkForOtaUpdate: vi.fn(async (_d: unknown, opts?: { silent?: boolean }) => {
    h.otaCalls.push({ opts });
    return h.otaShownReturn;
  }),
}));

import { versionService } from '@/services/version.service';

const descriptor = {
  bundleVersion: '1.0.0+ota.1',
  url: 'https://x/z.zip',
  checksum: 'sha',
  minNativeVersion: '1.0.0',
};

function payload(android: Record<string, unknown>) {
  return {
    android: { version: '1.0.0', storeUrl: 'https://store', ota: {}, otaStaging: {}, ...android },
    ios: { version: '1.0.0', storeUrl: '', ota: {}, otaStaging: {} },
  };
}

beforeEach(() => {
  h.platform = 'android';
  h.version = '1.0.0';
  h.payload = payload({});
  h.alertRole = 'cancel';
  h.channel = 'production';
  h.otaShownReturn = false;
  h.otaCalls = [];
  vi.clearAllMocks();
});

describe('versionService.checkAndPromptForUpdate — coordenação', () => {
  it('na web não faz nada (up to date)', async () => {
    h.platform = 'web';
    const out = await versionService.checkAndPromptForUpdate(false);
    expect(out).toEqual({ storePrompted: false, otaShown: false, error: false });
    expect(h.otaCalls).toHaveLength(0);
  });

  it('loja tem prioridade: aceitar a loja não roda OTA', async () => {
    h.payload = payload({ version: '1.1.0', ota: { '1.0.0': descriptor } });
    h.alertRole = 'confirm'; // usuário abriu a loja
    const out = await versionService.checkAndPromptForUpdate();
    expect(out).toMatchObject({ storePrompted: true, otaShown: false });
    expect(h.otaCalls).toHaveLength(0); // OTA não roda quando aceitou a loja
  });

  it('recusar a loja com OTA na linha baixa o OTA em silêncio', async () => {
    h.payload = payload({ version: '1.1.0', ota: { '1.0.0': descriptor } });
    h.alertRole = 'cancel'; // recusou a loja
    h.otaShownReturn = true;
    const out = await versionService.checkAndPromptForUpdate();
    expect(out).toMatchObject({ storePrompted: true, otaShown: true });
    expect(h.otaCalls).toHaveLength(1);
    expect(h.otaCalls[0].opts?.silent).toBe(true);
  });

  it('sem update de loja, oferece o OTA da linha normalmente (não silencioso)', async () => {
    h.payload = payload({ version: '1.0.0', ota: { '1.0.0': descriptor } });
    h.otaShownReturn = true;
    const out = await versionService.checkAndPromptForUpdate();
    expect(out).toMatchObject({ storePrompted: false, otaShown: true });
    expect(h.otaCalls).toHaveLength(1);
    expect(h.otaCalls[0].opts?.silent).toBeFalsy();
  });

  it('canal staging lê otaStaging (produção fica de fora)', async () => {
    h.channel = 'staging';
    h.payload = payload({ version: '1.0.0', ota: {}, otaStaging: { '1.0.0': descriptor } });
    h.otaShownReturn = true;
    const out = await versionService.checkAndPromptForUpdate();
    expect(out).toMatchObject({ otaShown: true });
    expect(h.otaCalls).toHaveLength(1);
  });

  it('nada disponível mostra o toast de "em dia" no check manual', async () => {
    const { toastService } = await import('@/services/toast.service');
    const out = await versionService.checkAndPromptForUpdate(true);
    expect(out).toEqual({ storePrompted: false, otaShown: false, error: false });
    expect(toastService.presentToastSuccess).toHaveBeenCalledTimes(1);
  });
});
