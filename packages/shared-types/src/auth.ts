// Auth contracts (issue #13 — Cloudflare auth spike integrated into the main worker).
// Phone-OTP → ES256 Bearer access token + opaque rotating refresh token. Cookie-free
// by design (CORS adjudication 2026-07-01 condition C2: never allow-credentials).
//
// Endpoints (apps/worker):
//   POST /v1/auth/otp/send    OtpSendRequest    -> OtpSendResponse | AuthErrorBody
//   POST /v1/auth/otp/verify  OtpVerifyRequest  -> OtpVerifyResponse | AuthErrorBody
//   POST /v1/auth/refresh     RefreshRequest    -> RefreshResponse | AuthErrorBody
//   POST /v1/auth/logout      (Bearer)          -> LogoutResponse | AuthErrorBody
//   GET  /v1/me               (Bearer)          -> MeResponse | AuthErrorBody
//   GET  /.well-known/jwks.json                 -> JWKS (public verification keys)
//
// Platform-level 429/503 (rate limits / unconfigured gates) use the worker's flat
// shape `{ success: false, error: string }` — status-code-driven handling applies.

/** Error body for all /v1/auth/* + /v1/me domain errors (spike-proven shape). */
export interface AuthErrorBody {
  ok: false;
  error: { code: string; message: string };
}

export interface OtpSendRequest {
  phone: string;
  country?: 'US' | 'GB' | 'AU';
  /** Cloudflare Turnstile client token — REQUIRED outside dev (fails closed). */
  turnstileToken?: string;
}

export interface OtpSendResponse {
  ok: true;
  sessionId: string;
  expiresInSec: number;
}

export interface OtpVerifyRequest {
  sessionId: string;
  code: string;
}

/** Common token-pair payload (verify + refresh). */
export interface AuthTokensBase {
  ok: true;
  /** ES256 JWT — send as `Authorization: Bearer <accessToken>`; uid = `sub` claim. */
  accessToken: string;
  /** Opaque rotating refresh token — store client-side, present in the JSON body. */
  refreshToken: string;
  /** Access-token lifetime in seconds. */
  expiresIn: number;
  /** Refresh-token lifetime in seconds. */
  refreshExpiresIn: number;
}

export interface OtpVerifyResponse extends AuthTokensBase {
  uid: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export type RefreshResponse = AuthTokensBase;

export interface LogoutResponse {
  ok: true;
}

export interface MeResponse {
  ok: true;
  uid: string;
  phone_e164: string | null;
  jti: string;
}
