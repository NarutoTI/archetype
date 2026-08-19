/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_FAKE_LOGIN?: string;
  readonly VITE_DEEP_LINK_SCHEME?: string;
  readonly VITE_DEEP_LINK_HOST?: string;
  // OTA / Live Updates (ver docs/native/OTA.md).
  readonly VITE_OTA_ENABLED?: string;
  readonly VITE_OTA_CHANNEL?: string;
  /** Gate key-v2: `'true'` rejeita descriptor OTA sem sessionKey. */
  readonly VITE_OTA_REQUIRE_SIGNED?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
