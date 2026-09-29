/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Explicit API base; blank/unset = localhost in dev, same-origin in production builds. */
  readonly VITE_API_URL?: string;
  /** Explicit Socket.IO base; defaults to the API base. */
  readonly VITE_WS_URL?: string;
  /** `true` for a SHARED, DISPOSABLE public-demo build (shows the shared-demo warning). */
  readonly VITE_PUBLIC_DEMO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
