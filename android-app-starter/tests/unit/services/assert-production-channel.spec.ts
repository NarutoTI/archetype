import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPromotableWebBuild,
  assertSignedPublicKey,
  assertSignConsistency,
  assertStoreReleaseGuards,
  OTA_BUILD_METADATA_FILE,
} from '../../../scripts/ota/assert-production-channel.js';

describe('assertSignConsistency', () => {
  const fixtureDirs: string[] = [];
  let originalRequireSigned: string | undefined;
  let originalOtaEnabled: string | undefined;
  let originalOtaChannel: string | undefined;

  beforeAll(() => {
    originalRequireSigned = process.env.VITE_OTA_REQUIRE_SIGNED;
    originalOtaEnabled = process.env.VITE_OTA_ENABLED;
    originalOtaChannel = process.env.VITE_OTA_CHANNEL;
  });

  beforeEach(() => {
    delete process.env.VITE_OTA_REQUIRE_SIGNED;
    delete process.env.VITE_OTA_ENABLED;
    delete process.env.VITE_OTA_CHANNEL;
  });

  afterEach(() => {
    for (const fixtureDir of fixtureDirs.splice(0)) {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    restoreEnv('VITE_OTA_REQUIRE_SIGNED', originalRequireSigned);
    restoreEnv('VITE_OTA_ENABLED', originalOtaEnabled);
    restoreEnv('VITE_OTA_CHANNEL', originalOtaChannel);
  });

  function restoreEnv(key: string, value: string | undefined): void {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  function createProductionEnv(
    requireSigned: boolean,
    options: { otaEnabled?: boolean; channel?: string } = {},
  ): string {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'archetype-ota-sign-'));
    fixtureDirs.push(fixtureDir);
    const otaEnabled = options.otaEnabled === true;
    const channel = options.channel ?? 'production';
    writeFileSync(
      join(fixtureDir, '.env.production'),
      `VITE_OTA_ENABLED=${otaEnabled ? 'true' : 'false'}\n` +
        `VITE_OTA_CHANNEL=${channel}\n` +
        `VITE_OTA_REQUIRE_SIGNED=${String(requireSigned)}\n`,
      'utf8',
    );
    return fixtureDir;
  }

  function fail(message: string): never {
    throw new Error(message);
  }

  function createFixture(): string {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'archetype-ota-build-'));
    fixtureDirs.push(fixtureDir);
    return fixtureDir;
  }

  function writeBuildMetadata(
    frontendDir: string,
    overrides: Record<string, unknown> = {},
  ): void {
    const wwwDir = join(frontendDir, 'www');
    mkdirSync(wwwDir, { recursive: true });
    writeFileSync(
      join(wwwDir, OTA_BUILD_METADATA_FILE),
      `${JSON.stringify({
        schemaVersion: 1,
        mode: 'production',
        otaEnabled: true,
        otaChannel: 'production',
        otaRequireSigned: false,
        ...overrides,
      })}\n`,
      'utf8',
    );
  }

  it('aceita bundle plano quando o gate está desligado', () => {
    const frontendDir = createProductionEnv(false);

    expect(() => assertSignConsistency(frontendDir, false, fail)).not.toThrow();
  });

  it('aceita bundle assinado quando o gate está ligado', () => {
    const frontendDir = createProductionEnv(true);

    expect(() => assertSignConsistency(frontendDir, true, fail)).not.toThrow();
  });

  it('rejeita bundle plano quando o gate está ligado', () => {
    const frontendDir = createProductionEnv(true);

    expect(() => assertSignConsistency(frontendDir, false, fail)).toThrow(
      'VITE_OTA_REQUIRE_SIGNED=true',
    );
  });

  it('rejeita bundle assinado quando o gate está desligado', () => {
    const frontendDir = createProductionEnv(false);

    expect(() => assertSignConsistency(frontendDir, true, fail)).toThrow(
      '--sign passado mas VITE_OTA_REQUIRE_SIGNED != true',
    );
  });

  it('aceita www de produção cujo gate corresponde à publicação plana', () => {
    const frontendDir = createFixture();
    writeBuildMetadata(frontendDir);

    expect(() => assertPromotableWebBuild(frontendDir, false, fail)).not.toThrow();
  });

  it('rejeita www gerado pelo modo simulator', () => {
    const frontendDir = createFixture();
    writeBuildMetadata(frontendDir, { mode: 'simulator', otaChannel: 'staging' });

    expect(() => assertPromotableWebBuild(frontendDir, false, fail)).toThrow(
      'não production',
    );
  });

  it('rejeita www cujo gate não corresponde à assinatura', () => {
    const frontendDir = createFixture();
    writeBuildMetadata(frontendDir, { otaRequireSigned: true });

    expect(() => assertPromotableWebBuild(frontendDir, false, fail)).toThrow(
      'assinatura e gate coerentes',
    );
  });

  it('rejeita --no-build sem metadado de origem', () => {
    const frontendDir = createFixture();

    expect(() => assertPromotableWebBuild(frontendDir, false, fail)).toThrow(
      `${OTA_BUILD_METADATA_FILE} não encontrado`,
    );
  });

  it('aceita gate assinado quando capacitor.config contém publicKey PEM', () => {
    const frontendDir = createProductionEnv(true);
    writeFileSync(
      join(frontendDir, 'capacitor.config.ts'),
      "const config = { plugins: { CapacitorUpdater: { publicKey: '-----BEGIN RSA PUBLIC KEY-----\\nabc\\n-----END RSA PUBLIC KEY-----\\n' } } };\n",
      'utf8',
    );

    expect(() => assertSignedPublicKey(frontendDir, fail)).not.toThrow();
  });

  it('rejeita gate assinado sem publicKey no capacitor.config', () => {
    const frontendDir = createProductionEnv(true);
    writeFileSync(join(frontendDir, 'capacitor.config.ts'), 'export default {};\n', 'utf8');

    expect(() => assertSignedPublicKey(frontendDir, fail)).toThrow(
      'publicKey não contém uma chave pública PEM válida',
    );
  });

  it('não exige publicKey quando o gate está desligado', () => {
    const frontendDir = createProductionEnv(false);

    expect(() => assertSignedPublicKey(frontendDir, fail)).not.toThrow();
  });

  it('permite AAB com OTA dormente (sem exigir VITE_OTA_ENABLED)', () => {
    const frontendDir = createProductionEnv(false);

    expect(() => assertStoreReleaseGuards(frontendDir, fail)).not.toThrow();
  });

  it('recusa AAB se o canal de produção resolver staging', () => {
    const frontendDir = createProductionEnv(false, { channel: 'staging' });

    expect(() => assertStoreReleaseGuards(frontendDir, fail)).toThrow(
      'VITE_OTA_CHANNEL=staging',
    );
  });

  it('com OTA ligado, recusa AAB signed-only sem publicKey', () => {
    const frontendDir = createProductionEnv(true, { otaEnabled: true });
    writeFileSync(join(frontendDir, 'capacitor.config.ts'), 'export default {};\n', 'utf8');

    expect(() => assertStoreReleaseGuards(frontendDir, fail)).toThrow(
      'publicKey não contém uma chave pública PEM válida',
    );
  });
});
