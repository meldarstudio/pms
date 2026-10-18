/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PWA_BUILD_ID: string;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
