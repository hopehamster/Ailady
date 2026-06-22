/// <reference types="vite/client" />

// DEV-only env (apps/web/.env.local, gitignored). Used to authenticate the local
// web client to the wrangler-dev worker's devGate; prod auth is Phase 3.
interface ImportMetaEnv {
  readonly VITE_DEV_SHARED_SECRET?: string;
  readonly VITE_DEV_UID?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
