/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FEEDBACK_FORM_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Replica leftover from Neon/Webpack. Declared so typecheck can run
// without rewriting Contents.ts in Phase 1.
declare const __ASSET_PREFIX__: string;
