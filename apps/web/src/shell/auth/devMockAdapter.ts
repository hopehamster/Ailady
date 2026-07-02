// DEV-ONLY mock auth adapter (#19). No SMS is sent; the fixed code below signs
// you in. The resulting session carries NO token — API calls keep riding the
// existing x-dev-secret path (devAuth.ts), exactly as before the shell landed.
// getAuthAdapter() only selects this under import.meta.env.DEV, so none of it
// ships in a production bundle.

import type { AuthAdapter } from "./authService";
import { looksLikePhone } from "./authService";
import type { AuthSession } from "./session";

/** The code the dev mock accepts (hinted in the DEV sign-in UI + used by e2e). */
export const DEV_OTP_CODE = "000000";

export const devMockAdapter: AuthAdapter = {
  name: "dev-mock",

  async requestCode(phone) {
    if (!looksLikePhone(phone)) return { ok: false, error: "invalid-phone" };
    return { ok: true };
  },

  async verifyCode(phone, code) {
    if (!looksLikePhone(phone)) return { ok: false, error: "invalid-phone" };
    if (code.trim() !== DEV_OTP_CODE) return { ok: false, error: "invalid-code" };
    const session: AuthSession = {
      uid: import.meta.env.VITE_DEV_UID ?? "dev-user",
      mode: "dev",
      createdAtMs: Date.now(),
    };
    return { ok: true, session };
  },
};
