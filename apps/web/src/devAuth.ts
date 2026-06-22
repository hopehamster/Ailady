// DEV-only auth headers for the local web client → wrangler-dev worker.
//
// The worker's `devGate` fails closed: it requires `x-dev-secret` to equal the
// worker's `DEV_SHARED_SECRET`. The web client carries that shared secret in a
// gitignored `apps/web/.env.local` (`VITE_DEV_SHARED_SECRET`) and sends it here.
//
// Gated by `import.meta.env.DEV` so NOTHING ships in a production build — the
// secret never reaches a prod bundle. Real phone-OTP auth replaces this in Phase 3.
export function devHeaders(): Record<string, string> {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_SHARED_SECRET) {
    return {
      "x-dev-secret": import.meta.env.VITE_DEV_SHARED_SECRET,
      "x-dev-uid": import.meta.env.VITE_DEV_UID ?? "dev-user",
    };
  }
  return {};
}
