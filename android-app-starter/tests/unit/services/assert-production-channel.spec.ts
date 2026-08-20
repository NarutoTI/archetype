import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertPromotableWebBuild,
  assertSignConsistency,
  OTA_BUILD_METADATA_FILE,
} from '../../../scripts/ota/assert-production-channel.js';

describe('assertSignConsistency', () => {
  const fixtureDirs: string[] = [];
  let originalRequireSigned: string | undefined;

  beforeAll(() => {
    originalRequireSigned = process.env.VITE_OTA_REQUIRE_SIGNED;
  });

  beforeEach(() => {
    delete process.env.VITE_OTA_REQUIRE_SIGNED;
  });

  afterEach(() => {
    for (const fixtureDir of fixtureDirs.splice(0)) {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (originalRequireSigned === undefined) {
      delete process.env.VITE_OTA_REQUIRE_SIGNED;
    } else {
      process.env.VITE_OTA_REQUIRE_SIGNED = originalRequireSigned;
    }
  });

  function createProductionEnv(requireSigned: boolean): string {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'archetype-ota-sign-'));
    fixtureDirs.push(fixtureDir);
    writeFileSync(
      join(fixtureDir, '.env.production'),
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
});
