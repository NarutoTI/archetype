/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_USE_FAKE_LOGIN?: string;
  readonly VITE_DEEP_LINK_SCHEME?: string;
  readonly VITE_DEEP_LINK_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
