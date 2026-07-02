// ============================================================================
// auth_phone.ts — minimal E.164 normalization. Ported verbatim from
// spikes/cloudflare-auth-spike-A/src/phone.ts (#13).
//
// PRODUCTION CAVEAT: real Aria should use libphonenumber (e.g. the wasm build
// of google-libphonenumber bundled at edge) to validate region + format. This
// stub is sufficient for the integrated auth flow but will reject some legit
// formats and accept some invalid ones. Replace before launch.
// ============================================================================

export interface PhoneNormResult {
  ok: boolean;
  e164?: string;
  reason?: string;
}

export function normalizeE164(input: string, defaultCountry: "US" | "GB" | "AU" = "US"): PhoneNormResult {
  let s = (input ?? "").trim();
  if (!s) return { ok: false, reason: "empty" };

  // Strip everything that isn't a digit or +
  s = s.replace(/[^\d+]/g, "");

  // If already E.164 (+ then 8-15 digits)
  if (/^\+\d{8,15}$/.test(s)) return { ok: true, e164: s };

  // Country-prefix defaults
  if (defaultCountry === "US") {
    // 10-digit US — assume +1
    if (/^\d{10}$/.test(s)) return { ok: true, e164: "+1" + s };
    // 11-digit starting with 1 — already national format
    if (/^1\d{10}$/.test(s)) return { ok: true, e164: "+" + s };
  }
  if (defaultCountry === "GB" && /^0\d{9,10}$/.test(s)) {
    return { ok: true, e164: "+44" + s.slice(1) };
  }
  if (defaultCountry === "AU" && /^0\d{9}$/.test(s)) {
    return { ok: true, e164: "+61" + s.slice(1) };
  }

  return { ok: false, reason: "unrecognized_format" };
}

const enc = new TextEncoder();

export async function phoneHash(e164: string, salt: string): Promise<string> {
  // Hash with a per-tenant salt so the hash isn't a global identifier.
  // The salt is a Workers secret (PHONE_HASH_SALT). Rotating it requires
  // a backfill — design accordingly.
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(salt + ":" + e164));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}
