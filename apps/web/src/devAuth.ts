// Auth headers for every web → worker API call (chat, TTS). Filename kept as
// devAuth.ts because AriaTalkingView + avatar/speech import it by this path.
//
// Two sources, in order:
//   1. A real OTP session's Bearer token (shell/auth/session.ts) — the
//      production path once the Security stream's phone-OTP endpoints issue
//      tokens. Works in any build.
//   2. DEV-only x-dev-secret: the worker's `devGate` fails closed and requires
//      `x-dev-secret` to equal the worker's `DEV_SHARED_SECRET`. The web client
//      carries that shared secret in a gitignored `apps/web/.env.local`
//      (`VITE_DEV_SHARED_SECRET`). Gated by `import.meta.env.DEV` so the secret
//      NEVER reaches a production bundle.
import { sessionToken } from "./shell/auth/session";

export function devHeaders(): Record<string, string> {
  const token = sessionToken();
  if (token) {
    return { authorization: `Bearer ${token}` };
  }
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_SHARED_SECRET) {
    return {
      "x-dev-secret": import.meta.env.VITE_DEV_SHARED_SECRET,
      "x-dev-uid": import.meta.env.VITE_DEV_UID ?? "dev-user",
    };
  }
  return {};
}
