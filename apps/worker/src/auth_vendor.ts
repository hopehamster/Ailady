// ============================================================================
// auth_vendor.ts — pluggable OTP delivery + verification. Ported verbatim from
// spikes/cloudflare-auth-spike-A/src/otp_vendor.ts (#13).
//
// The Worker NEVER stores OTP codes in D1 in the vendor path. The vendor
// (Plivo Verify / Twilio Verify) holds the secret + counts attempts +
// runs fraud shield. We only persist the session_id pointer.
//
// Switching vendors is one bind change — see wrangler.toml OTP_VENDOR var.
// ============================================================================

export interface OtpSendResult {
  ok: boolean;
  vendorSessionId: string;
  reason?: string;
}

export interface OtpVerifyResult {
  ok: boolean;
  reason?: string;
}

export interface OtpVendor {
  send(phoneE164: string, ctx: { ip?: string; ua?: string }): Promise<OtpSendResult>;
  verify(vendorSessionId: string, code: string): Promise<OtpVerifyResult>;
}

// ----------------------------------------------------------------------------
// Mock vendor — DEV ONLY. Generates a 6-digit code, logs it to console, and
// stores the code in memory keyed by sessionId. Restarting the Worker
// invalidates all in-flight codes (fine for local dev).
//
// In production, the OTP_VENDOR env var flips this to PlivoVerifyVendor and
// no code in the verify/refresh path needs to change.
// ----------------------------------------------------------------------------
const MOCK_STORE = new Map<string, { code: string; phone: string; expiresAt: number; attempts: number }>();

export class MockOtpVendor implements OtpVendor {
  // Optional deterministic code (staging E2E: OTP is Playwright-drivable without
  // scraping stdout). Absent → random, as before (local dev via the log line).
  constructor(private readonly fixedCode?: string) {}

  async send(phoneE164: string, ctx: { ip?: string; ua?: string }): Promise<OtpSendResult> {
    const code =
      this.fixedCode && /^\d{6}$/.test(this.fixedCode)
        ? this.fixedCode
        : String(Math.floor(100000 + Math.random() * 900000));
    const sessionId = crypto.randomUUID();
    MOCK_STORE.set(sessionId, {
      code,
      phone: phoneE164,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      attempts: 0,
    });
    // DEV BOUNDARY: In the Plivo path, this is replaced by the HTTP call.
    // Log the OTP so the local e2e flow can run with curl.
    console.log(`[MOCK_OTP_VENDOR] send phone=${phoneE164} sessionId=${sessionId} code=${code} ip=${ctx.ip ?? "?"}`);
    return { ok: true, vendorSessionId: sessionId };
  }
  async verify(vendorSessionId: string, code: string): Promise<OtpVerifyResult> {
    const row = MOCK_STORE.get(vendorSessionId);
    if (!row) return { ok: false, reason: "session_unknown" };
    if (row.attempts >= 5) return { ok: false, reason: "too_many_attempts" };
    if (Math.floor(Date.now() / 1000) > row.expiresAt) {
      MOCK_STORE.delete(vendorSessionId);
      return { ok: false, reason: "expired" };
    }
    row.attempts += 1;
    if (row.code !== code) return { ok: false, reason: "code_mismatch" };
    MOCK_STORE.delete(vendorSessionId);
    return { ok: true };
  }
}

// ----------------------------------------------------------------------------
// Plivo Verify vendor — production path. Auth: HTTP Basic with AuthID:AuthToken.
//
//   POST https://api.plivo.com/v1/Account/{authId}/Verify/Session/
//        body: { recipient, app_uuid, channel: "sms" }
//
//   POST https://api.plivo.com/v1/Account/{authId}/Verify/Session/{sessionUuid}/
//        body: { otp }
//
// Plivo gives 10 verify attempts per session built-in (toll-fraud defense),
// runs Fraud Shield for free, and OTP delivery is free — you only pay the SMS.
// ----------------------------------------------------------------------------
export class PlivoVerifyVendor implements OtpVendor {
  constructor(
    private readonly authId: string,
    private readonly authToken: string,
    private readonly appUuid: string,
  ) {}

  private basicAuth(): string {
    return "Basic " + btoa(`${this.authId}:${this.authToken}`);
  }

  async send(phoneE164: string, _ctx: { ip?: string; ua?: string }): Promise<OtpSendResult> {
    const url = `https://api.plivo.com/v1/Account/${this.authId}/Verify/Session/`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.basicAuth(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        recipient: phoneE164,
        app_uuid: this.appUuid,
        channel: "sms",
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, vendorSessionId: "", reason: `plivo_send_${res.status}:${text.slice(0, 120)}` };
    }
    const data = (await res.json()) as { session_uuid?: string; message?: string };
    if (!data.session_uuid) {
      return { ok: false, vendorSessionId: "", reason: "plivo_no_session_uuid" };
    }
    return { ok: true, vendorSessionId: data.session_uuid };
  }

  async verify(vendorSessionId: string, code: string): Promise<OtpVerifyResult> {
    const url = `https://api.plivo.com/v1/Account/${this.authId}/Verify/Session/${vendorSessionId}/`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: this.basicAuth(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ otp: code }),
    });
    if (res.status === 200 || res.status === 202) return { ok: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, reason: "code_mismatch_or_session_expired" };
    }
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `plivo_verify_${res.status}:${text.slice(0, 120)}` };
  }
}

// ----------------------------------------------------------------------------
// Twilio Verify vendor — production path (the vendor we actually have creds for).
// Auth: HTTP Basic with AccountSid:AuthToken. Form-encoded bodies (Verify v2 is
// application/x-www-form-urlencoded, NOT JSON), JSON responses.
//
//   POST https://verify.twilio.com/v2/Services/{serviceSid}/Verifications
//        body: To=<e164>&Channel=sms   → { sid: "VE…", status: "pending" }
//
//   POST https://verify.twilio.com/v2/Services/{serviceSid}/VerificationCheck
//        body: VerificationSid=<VE…>&Code=<otp>  → { status: "approved"|"pending", valid }
//
// Like Plivo: Twilio holds the code, counts attempts, runs Fraud Guard; we only
// persist the Verification sid (returned as vendorSessionId) and re-present it at
// check time as VerificationSid — so the vendor interface needs only (sid, code),
// never the phone number, exactly matching the OtpVendor contract.
// ----------------------------------------------------------------------------
export class TwilioVerifyVendor implements OtpVendor {
  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly serviceSid: string,
  ) {}

  private basicAuth(): string {
    return "Basic " + btoa(`${this.accountSid}:${this.authToken}`);
  }

  private headers(): HeadersInit {
    return {
      Authorization: this.basicAuth(),
      "Content-Type": "application/x-www-form-urlencoded",
    };
  }

  async send(phoneE164: string, _ctx: { ip?: string; ua?: string }): Promise<OtpSendResult> {
    const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/Verifications`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: new URLSearchParams({ To: phoneE164, Channel: "sms" }).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, vendorSessionId: "", reason: `twilio_send_${res.status}:${text.slice(0, 120)}` };
    }
    const data = (await res.json()) as { sid?: string; status?: string };
    if (!data.sid) {
      return { ok: false, vendorSessionId: "", reason: "twilio_no_verification_sid" };
    }
    return { ok: true, vendorSessionId: data.sid };
  }

  async verify(vendorSessionId: string, code: string): Promise<OtpVerifyResult> {
    const url = `https://verify.twilio.com/v2/Services/${this.serviceSid}/VerificationCheck`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: new URLSearchParams({ VerificationSid: vendorSessionId, Code: code }).toString(),
    });
    if (res.ok) {
      const data = (await res.json()) as { status?: string; valid?: boolean };
      if (data.status === "approved") return { ok: true };
      return { ok: false, reason: `twilio_status_${data.status ?? "unknown"}` };
    }
    // 404 = verification consumed / expired / max-checks-reached (Twilio deletes it).
    if (res.status === 404) return { ok: false, reason: "code_expired_or_not_found" };
    const text = await res.text().catch(() => "");
    return { ok: false, reason: `twilio_verify_${res.status}:${text.slice(0, 120)}` };
  }
}

// ----------------------------------------------------------------------------
// Factory — chooses based on env.
//
// FAIL CLOSED (mirrors devGate philosophy): outside dev the factory REQUIRES an
// explicit real vendor (OTP_VENDOR ∈ {'twilio','plivo'}). Any other value —
// unset, empty, a typo, or literally 'mock' — THROWS in prod so a misconfigured
// deploy 503s instead of silently accepting every OTP via the Mock (which always
// "succeeds" on send and verifies any code it minted). The Mock may ONLY be
// selected when ENV === 'dev'. The caller turns the throw into a 503
// vendor_unavailable.
// ----------------------------------------------------------------------------
export function getVendor(env: {
  ENV?: string;
  OTP_VENDOR?: string;
  PLIVO_AUTH_ID?: string;
  PLIVO_AUTH_TOKEN?: string;
  PLIVO_VERIFY_APP_UUID?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
  MOCK_OTP_CODE?: string;
}): OtpVendor {
  if (env.OTP_VENDOR === "twilio") {
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN || !env.TWILIO_VERIFY_SERVICE_SID) {
      throw new Error(
        "TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_VERIFY_SERVICE_SID must all be set when OTP_VENDOR=twilio",
      );
    }
    return new TwilioVerifyVendor(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_VERIFY_SERVICE_SID,
    );
  }
  if (env.OTP_VENDOR === "plivo") {
    if (!env.PLIVO_AUTH_ID || !env.PLIVO_AUTH_TOKEN || !env.PLIVO_VERIFY_APP_UUID) {
      throw new Error("PLIVO_AUTH_ID/PLIVO_AUTH_TOKEN/PLIVO_VERIFY_APP_UUID must all be set when OTP_VENDOR=plivo");
    }
    return new PlivoVerifyVendor(env.PLIVO_AUTH_ID, env.PLIVO_AUTH_TOKEN, env.PLIVO_VERIFY_APP_UUID);
  }
  // No real vendor selected. The Mock is dev-only — with ONE explicit exception:
  // a STAGING deploy may opt into the Mock (OTP_VENDOR="mock") so the full auth flow
  // is Playwright-drivable end-to-end with a deterministic code. PRODUCTION never
  // reaches this — ENV==="production" falls straight to the throw below (fail closed).
  if (env.ENV === "dev") {
    return new MockOtpVendor();
  }
  if (env.ENV === "staging" && env.OTP_VENDOR === "mock") {
    return new MockOtpVendor(env.MOCK_OTP_CODE);
  }
  throw new Error(
    `OTP_VENDOR must be an explicit real vendor (e.g. 'twilio' or 'plivo') when ENV !== 'dev'/'staging' — refusing to fall back to the Mock vendor in '${env.ENV ?? "unset"}' (got OTP_VENDOR='${env.OTP_VENDOR ?? "unset"}')`,
  );
}
