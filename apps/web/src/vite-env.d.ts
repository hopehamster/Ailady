/// <reference types="vite/client" />

// DEV-only env (apps/web/.env.local, gitignored). Used to authenticate the local
// web client to the wrangler-dev worker's devGate; prod auth is Phase 3.
interface ImportMetaEnv {
  readonly VITE_DEV_SHARED_SECRET?: string;
  readonly VITE_DEV_UID?: string;
  // Cloudflare Turnstile sitekey (#42) — public, baked into the prod build.
  // Absent in dev → the Turnstile widget is inert and OTP send carries no token.
  readonly VITE_TURNSTILE_SITEKEY?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
