import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger } from '@/utils/logger';

const hoisted = vi.hoisted(() => ({
  mockIsAvailable: vi.fn(),
  mockVerifyIdentity: vi.fn(),
  mockPreferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@capgo/capacitor-native-biometric', () => ({
  NativeBiometric: {
    isAvailable: hoisted.mockIsAvailable,
    verifyIdentity: hoisted.mockVerifyIdentity,
  },
  BiometryType: {
    NONE: 0,
    TOUCH_ID: 1,
    FACE_ID: 2,
    FINGERPRINT: 3,
    FACE_AUTHENTICATION: 4,
    IRIS_AUTHENTICATION: 5,
    MULTIPLE: 6,
    DEVICE_CREDENTIAL: 7,
  },
  BiometricAuthError: {
    UNKNOWN_ERROR: 0,
    BIOMETRICS_UNAVAILABLE: 1,
    USER_LOCKOUT: 2,
    BIOMETRICS_NOT_ENROLLED: 3,
    USER_TEMPORARY_LOCKOUT: 4,
    AUTHENTICATION_FAILED: 10,
    APP_CANCEL: 11,
    INVALID_CONTEXT: 12,
    NOT_INTERACTIVE: 13,
    PASSCODE_NOT_SET: 14,
    SYSTEM_CANCEL: 15,
    USER_CANCEL: 16,
    USER_FALLBACK: 17,
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => true),
    getPlatform: vi.fn(() => 'android'),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: hoisted.mockPreferences,
}));

vi.mock('@/i18n', () => ({
  default: {
    global: {
      t: (key: string) => key,
    },
  },
}));

import { BiometryType } from '@capgo/capacitor-native-biometric';
import { biometricService } from '@/services/biometric.service';

/** Valores do Preferences por chave; qualquer chave ausente resolve como `null`. */
const givenPreferences = (values: Record<string, string | null>) => {
  hoisted.mockPreferences.get.mockImplementation(async ({ key }: { key: string }) => ({
    value: values[key] ?? null,
  }));
};

describe('biometricService.authenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    biometricService.resetCache();
    hoisted.mockIsAvailable.mockResolvedValue({
      isAvailable: true,
      biometryType: BiometryType.FINGERPRINT,
    });
    hoisted.mockVerifyIdentity.mockResolvedValue(undefined);
  });

  it('retorna true após autenticação biométrica bem-sucedida', async () => {
    await expect(biometricService.authenticate('Reason', 'Title', 'Subtitle')).resolves.toBe(true);

    expect(hoisted.mockVerifyIdentity).toHaveBeenCalledWith({
      reason: 'Reason',
      title: 'Title',
      subtitle: 'Subtitle',
      allowedBiometryTypes: [BiometryType.MULTIPLE, BiometryType.DEVICE_CREDENTIAL],
      useFallback: true,
      maxAttempts: 5,
    });
  });

  it('oferece credencial do aparelho em vez de botão cancelar', async () => {
    await biometricService.authenticate('Reason', 'Title', 'Subtitle');

    const [options] = hoisted.mockVerifyIdentity.mock.calls[0];
    // O BiometricPrompt não aceita botão negativo junto de DEVICE_CREDENTIAL.
    expect(options.allowedBiometryTypes).toContain(BiometryType.DEVICE_CREDENTIAL);
    expect(options.negativeButtonText).toBeUndefined();
    // Repetiria o `subtitle` numa segunda linha do diálogo nativo.
    expect(options.description).toBeUndefined();
  });

  it.each([16, '16', 17, 11, 15])('trata saída do usuário / interrupção no código %s', async (code) => {
    hoisted.mockVerifyIdentity.mockRejectedValue({ code });

    await expect(biometricService.authenticate()).resolves.toBe(false);

    expect(logger.log).toHaveBeenCalledWith(
      'Biometric authentication cancelled or interrupted',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([10, 2, 4])('trata rejeição / lockout no código %s', async (code) => {
    hoisted.mockVerifyIdentity.mockRejectedValue({ code });

    await expect(biometricService.authenticate()).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(
      'Biometric authentication rejected or locked out',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it.each([1, 3, 14])('reporta estado do aparelho no código %s sem log de erro', async (code) => {
    hoisted.mockVerifyIdentity.mockRejectedValue({ code });

    await expect(biometricService.authenticate()).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(
      'Biometric unavailable or not enrolled on this device',
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('loga erro desconhecido como falha operacional', async () => {
    const error = { code: 'unexpected', message: 'Native failure' };
    hoisted.mockVerifyIdentity.mockRejectedValue(error);

    await expect(biometricService.authenticate()).resolves.toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      'Biometric authentication failed:',
      error,
    );
  });

  it('não chama verifyIdentity quando a biometria está indisponível', async () => {
    hoisted.mockIsAvailable.mockResolvedValue({
      isAvailable: false,
      biometryType: BiometryType.NONE,
    });

    await expect(biometricService.authenticate()).resolves.toBe(false);

    expect(hoisted.mockVerifyIdentity).not.toHaveBeenCalled();
  });
});

describe('biometricService.checkBiometricAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    biometricService.resetCache();
    hoisted.mockIsAvailable.mockResolvedValue({
      isAvailable: true,
      biometryType: BiometryType.FINGERPRINT,
    });
    hoisted.mockVerifyIdentity.mockResolvedValue(undefined);
    givenPreferences({ auth_token: 'token', 'biometry-enabled': 'true' });
  });

  it('desbloqueia e preserva a sessão após autenticação bem-sucedida', async () => {
    await expect(biometricService.checkBiometricAuth()).resolves.toBe(true);

    expect(hoisted.mockVerifyIdentity).toHaveBeenCalledTimes(1);
    expect(hoisted.mockPreferences.remove).not.toHaveBeenCalled();
  });

  it('pula o prompt quando não há token de sessão', async () => {
    givenPreferences({ 'biometry-enabled': 'true' });

    await expect(biometricService.checkBiometricAuth()).resolves.toBe(false);

    expect(hoisted.mockVerifyIdentity).not.toHaveBeenCalled();
    expect(hoisted.mockPreferences.remove).not.toHaveBeenCalled();
  });

  it('pula o prompt quando o usuário não habilitou biometria', async () => {
    givenPreferences({ auth_token: 'token', 'biometry-enabled': 'false' });

    await expect(biometricService.checkBiometricAuth()).resolves.toBe(false);

    expect(hoisted.mockVerifyIdentity).not.toHaveBeenCalled();
    expect(hoisted.mockPreferences.remove).not.toHaveBeenCalled();
  });

  // Congela um comportamento conhecido: sem biometria disponível o gate é pulado e o token
  // segue valendo. Ver docs/ANDROID-BUILD-TOOLCHAIN.md § Biometria.
  it('pula o prompt quando o aparelho não tem biometria disponível', async () => {
    hoisted.mockIsAvailable.mockResolvedValue({
      isAvailable: false,
      biometryType: BiometryType.NONE,
    });

    await expect(biometricService.checkBiometricAuth()).resolves.toBe(false);

    expect(hoisted.mockVerifyIdentity).not.toHaveBeenCalled();
    expect(hoisted.mockPreferences.remove).not.toHaveBeenCalled();
  });

  // Congela o contrato: unlock que não conclui derruba a sessão e força login completo.
  // Alcançável pelo gesto de voltar, mesmo sem botão cancelar.
  it('apaga o token de sessão quando a autenticação não conclui', async () => {
    hoisted.mockVerifyIdentity.mockRejectedValue({ code: 16 });

    await expect(biometricService.checkBiometricAuth()).resolves.toBe(false);

    expect(hoisted.mockPreferences.remove).toHaveBeenCalledWith({ key: 'auth_token' });
  });

  it('não apaga o token quando a leitura do Preferences falha', async () => {
    hoisted.mockPreferences.get.mockRejectedValue(new Error('storage unavailable'));

    await expect(biometricService.checkBiometricAuth()).resolves.toBe(false);

    expect(hoisted.mockPreferences.remove).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Error during biometric check:',
      expect.any(Error),
    );
  });
});
