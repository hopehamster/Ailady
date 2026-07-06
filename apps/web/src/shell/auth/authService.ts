// Thin client auth service (#19): phone entry → OTP entry → session.
//
// The UI talks ONLY to this interface. Two adapters implement it:
//   - devMockAdapter (DEV builds): instant local verify, session rides the
//     existing x-dev-secret path (devAuth.ts) — the shell works today.
//   - otpApiAdapter (prod builds): the real phone-OTP Bearer endpoints the
//     Security stream is landing. Contracts snap in at otpApiAdapter.ts.
// Vite statically eliminates the DEV branch, so no dev-mock code (and no dev
// secret assumption) reaches a production bundle.

import type { AuthSession } from "./session";
import { devMockAdapter } from "./devMockAdapter";
import { otpApiAdapter } from "./otpApiAdapter";

/** Machine-readable failure kinds; warm user copy lives in errors/authErrors.ts. */
export type AuthErrorKind =
  | "invalid-phone"
  | "invalid-code"
  | "expired-code"
  | "rate-limited"
  | "unavailable"
  | "network"
  | "unknown";

// The worker's OTP flow is SESSION-BASED: send returns a `sessionId` that verify
// consumes (verify never re-sees the phone). So requestCode returns the sessionId
// for SignIn to thread into verifyCode. Turnstile token is passed on send (prod).
export type RequestCodeResult =
  | { ok: true; sessionId: string; expiresInSec: number }
  | { ok: false; error: AuthErrorKind };

export type VerifyCodeResult =
  | { ok: true; session: AuthSession }
  | { ok: false; error: AuthErrorKind };

export interface AuthAdapter {
  /** Diagnostic label ("dev-mock" | "otp-api"). */
  readonly name: string;
  /** Ask the backend to text a one-time code to `phone`; returns the session pointer. */
  requestCode(phone: string, turnstileToken?: string): Promise<RequestCodeResult>;
  /** Trade the send-issued sessionId + code for a session. */
  verifyCode(sessionId: string, code: string): Promise<VerifyCodeResult>;
}

export function getAuthAdapter(): AuthAdapter {
  return import.meta.env.DEV ? devMockAdapter : otpApiAdapter;
}

/** Loose sanity check only — the backend owns real validation. */
export function looksLikePhone(phone: string): boolean {
  const digits = phone.replace(/[^\d]/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
