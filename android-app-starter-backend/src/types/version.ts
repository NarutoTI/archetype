/**
 * Tipos do payload público de `GET /version`.
 *
 * Além da versão de loja por plataforma (que dispara o prompt de atualização
 * nativo), carrega o alvo OTA por linha nativa. Ver docs/native/OTA.md no app.
 */

/**
 * Alvo OTA de uma linha nativa, entregue dentro da resposta de `GET /version`.
 * O app escolhe a entrada que casa com a versão nativa instalada.
 */
export interface OtaDescriptor {
  /** "<versaoNativa>+ota.<n>", ex.: "1.0.0+ota.3". */
  bundleVersion: string;
  /** URL pública absoluta do zip do bundle (R2). */
  url: string;
  /** Checksum do `@capgo/cli bundle zip --json`, verificado pelo plugin. */
  checksum: string;
  /** Session key (ivSessionKey) para bundles cifrados com key-v2. */
  sessionKey?: string;
  /** Versão nativa mínima capaz de rodar este bundle (gate de compatibilidade). */
  minNativeVersion: string;
  /** Aplica sem perguntar. Use só para hotfix crítico. */
  mandatory?: boolean;
  /** Mensagem por locale mostrada no prompt de aceite. */
  changelog?: Record<string, string>;
}

/**
 * Info de versão por plataforma devolvida por `GET /version`.
 * `ota` / `otaStaging` mapeiam versão nativa -> descriptor OTA mais recente.
 * Mapa vazio (ou chave da linha ausente) significa "sem OTA para essa linha".
 */
export interface PlatformVersionInfo {
  version: string;
  minSupportedVersion: string;
  storeUrl: string;
  ota: Record<string, OtaDescriptor>;
  otaStaging: Record<string, OtaDescriptor>;
}

export interface AppVersionInfo {
  android: PlatformVersionInfo;
  ios: PlatformVersionInfo;
}
