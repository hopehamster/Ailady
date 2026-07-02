// Real phone-OTP adapter (#19) — THE single snap-in point for the Security
// stream's Bearer endpoints.
//
// SNAP-IN (when packages/shared-types/src/auth.ts publishes the contracts):
//   1. Import the request/response types + endpoint paths from @aria/shared-types.
//   2. Replace the local `REQUEST_PATH` / `VERIFY_PATH` + response parsing below.
//   3. Nothing else changes — the UI and session store only see AuthAdapter.
//
// Until the endpoints are live, requests fail soft: a 404/501 maps to the
// "unavailable" kind, which the sign-in screen renders as warm not-yet-open
// copy — never a raw status or a crash.

import type { AuthAdapter, AuthErrorKind } from "./authService";
import { looksLikePhone } from "./authService";

const REQUEST_PATH = "/api/auth/otp/request";
const VERIFY_PATH = "/api/auth/otp/verify";

function kindForStatus(status: number): AuthErrorKind {
  if (status === 429) return "rate-limited";
  if (status === 404 || status === 501 || status === 503) return "unavailable";
  if (status === 400 || status === 401 || status === 403) return "invalid-code";
  if (status === 410) return "expired-code";
  return "unknown";
}

async function postJson(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export const otpApiAdapter: AuthAdapter = {
  name: "otp-api",

  async requestCode(phone) {
    if (!looksLikePhone(phone)) return { ok: false, error: "invalid-phone" };
    try {
      const r = await postJson(REQUEST_PATH, { phone });
      const data = (await r.json().catch(() => null)) as { success?: boolean } | null;
      if (r.ok && data?.success !== false) return { ok: true };
      return { ok: false, error: kindForStatus(r.status) };
    } catch {
      return { ok: false, error: "network" };
    }
  },

  async verifyCode(phone, code) {
    if (!looksLikePhone(phone)) return { ok: false, error: "invalid-phone" };
    try {
      const r = await postJson(VERIFY_PATH, { phone, code });
      const data = (await r.json().catch(() => null)) as {
        success?: boolean;
        token?: string;
        uid?: string;
      } | null;
      if (r.ok && data?.success !== false && typeof data?.token === "string" && data.token) {
        return {
          ok: true,
          session: {
            uid: typeof data.uid === "string" && data.uid ? data.uid : "user",
            mode: "otp",
            token: data.token,
            createdAtMs: Date.now(),
          },
        };
      }
      return { ok: false, error: kindForStatus(r.status) };
    } catch {
      return { ok: false, error: "network" };
    }
  },
};
