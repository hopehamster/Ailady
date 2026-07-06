// Real phone-OTP adapter (#42) — the prod Bearer path, wired to the worker's
// SESSION-BASED contract (packages/shared-types/src/auth.ts):
//   POST /v1/auth/otp/send   { phone, turnstileToken? } -> { ok, sessionId, expiresInSec }
//   POST /v1/auth/otp/verify { sessionId, code }        -> { ok, accessToken, refreshToken, expiresIn, refreshExpiresIn, uid }
//
// send returns a sessionId that verify consumes (verify never re-sees the phone);
// SignIn threads the sessionId between the two steps. On success verify stores the
// access token (Bearer) + the rotating refresh token + expiry into the session.
//
// Error copy is split by STEP: send-side statuses (turnstile/phone) and verify-side
// statuses (wrong/expired code) map to different warm kinds — the old shared
// kindForStatus mislabeled a send-time 403 as "that code didn't match".

import type {
  OtpSendRequest,
  OtpSendResponse,
  OtpVerifyRequest,
  OtpVerifyResponse,
} from "@aria/shared-types";
import type { AuthAdapter, AuthErrorKind } from "./authService";
import { looksLikePhone } from "./authService";

const SEND_PATH = "/v1/auth/otp/send";
const VERIFY_PATH = "/v1/auth/otp/verify";

/** SEND step (phone entry): a 403 here is a Turnstile/bot failure, NOT a bad code. */
function kindForSend(status: number): AuthErrorKind {
  if (status === 400) return "invalid-phone"; // missing/invalid phone
  if (status === 429) return "rate-limited";
  if (status === 403) return "unknown"; // turnstile_failed → generic "try once more" (re-arm mints a fresh token)
  if (status === 404 || status === 501 || status === 503) return "unavailable";
  return "unknown";
}

/** VERIFY step (code entry): 401 wrong code, 410/404 session gone. */
function kindForVerify(status: number): AuthErrorKind {
  if (status === 401 || status === 400) return "invalid-code"; // bad/missing code
  if (status === 410 || status === 404) return "expired-code"; // session expired / not found
  if (status === 429) return "rate-limited";
  if (status === 503) return "unavailable";
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

  async requestCode(phone, turnstileToken) {
    if (!looksLikePhone(phone)) return { ok: false, error: "invalid-phone" };
    try {
      const req: OtpSendRequest = { phone, turnstileToken };
      const r = await postJson(SEND_PATH, req);
      const data = (await r.json().catch(() => null)) as Partial<OtpSendResponse> | null;
      if (r.ok && data?.ok === true && typeof data.sessionId === "string" && data.sessionId) {
        return {
          ok: true,
          sessionId: data.sessionId,
          expiresInSec: typeof data.expiresInSec === "number" ? data.expiresInSec : 300,
        };
      }
      return { ok: false, error: kindForSend(r.status) };
    } catch {
      return { ok: false, error: "network" };
    }
  },

  async verifyCode(sessionId, code) {
    if (!sessionId || !code) return { ok: false, error: "invalid-code" };
    try {
      const req: OtpVerifyRequest = { sessionId, code };
      const r = await postJson(VERIFY_PATH, req);
      const data = (await r.json().catch(() => null)) as Partial<OtpVerifyResponse> | null;
      if (
        r.ok &&
        data?.ok === true &&
        typeof data.accessToken === "string" &&
        data.accessToken
      ) {
        const expiresIn = typeof data.expiresIn === "number" ? data.expiresIn : 900;
        return {
          ok: true,
          session: {
            uid: typeof data.uid === "string" && data.uid ? data.uid : "user",
            mode: "otp",
            token: data.accessToken,
            refreshToken:
              typeof data.refreshToken === "string" ? data.refreshToken : undefined,
            expiresAtMs: Date.now() + expiresIn * 1000,
            createdAtMs: Date.now(),
          },
        };
      }
      return { ok: false, error: kindForVerify(r.status) };
    } catch {
      return { ok: false, error: "network" };
    }
  },
};
