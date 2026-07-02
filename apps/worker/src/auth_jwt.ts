// ============================================================================
// auth_jwt.ts — ES256 JWT sign + verify + JWKS using Cloudflare Workers Web
// Crypto. Ported verbatim from spikes/cloudflare-auth-spike-A/src/jwt.ts (#13).
//
// Why ES256 (ECDSA P-256 + SHA-256) and not HS256:
//   - HS256 needs the same secret on issuer + verifier. If Aria ever runs a
//     second verifier (e.g. a separate Workers project for analytics), it'd
//     need the secret too. That's a leak surface.
//   - ES256 lets the issuer hold a PRIVATE key and the verifier(s) fetch the
//     PUBLIC key from /.well-known/jwks.json — same model Firebase uses.
//   - Key rotation is non-breaking: old kids stay in JWKS until tokens expire.
//
// Security defaults we override (these are NOT optional):
//   - `alg` is validated explicitly in verify(); we never trust the header alg.
//   - We enforce iss + aud + exp + nbf claims.
//   - jti is verified against access_token_revocations on hot path.
// ============================================================================

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---------- base64url helpers ----------
function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function b64uDecode(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s.length % 4 === 0 ? 0 : 4 - (s.length % 4);
  s = s + "=".repeat(pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64uJSON(obj: unknown): string {
  return b64uEncode(enc.encode(JSON.stringify(obj)));
}

// ---------- ES256 key handling ----------

export interface JwkEC {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  d?: string; // present only on private JWK
  kid?: string;
  alg?: "ES256";
  use?: "sig";
}

export async function generateEs256KeyPair(): Promise<{
  kid: string;
  publicJwk: JwkEC;
  privateJwk: JwkEC;
}> {
  // ECDSA generateKey returns a CryptoKeyPair; the WebCrypto types union it with
  // CryptoKey, so narrow it explicitly.
  const pair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const privateJwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JwkEC;
  const publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JwkEC;
  // kid = first 16 chars of base64url(SHA-256(public x||y)) — stable, collision-resistant enough.
  const concat = (publicJwk.x ?? "") + (publicJwk.y ?? "");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(concat));
  const kid = b64uEncode(digest).slice(0, 16);
  publicJwk.kid = kid;
  publicJwk.alg = "ES256";
  publicJwk.use = "sig";
  privateJwk.kid = kid;
  privateJwk.alg = "ES256";
  privateJwk.use = "sig";
  return { kid, publicJwk, privateJwk };
}

async function importPrivateKey(jwk: JwkEC): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

async function importPublicKey(jwk: JwkEC): Promise<CryptoKey> {
  // Strip the private component if accidentally passed
  const { d: _d, ...pubOnly } = jwk;
  return crypto.subtle.importKey("jwk", pubOnly as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
}

// ---------- sign / verify ----------

export interface AccessTokenClaims {
  iss: string;
  aud: string;
  sub: string; // uid
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  phone_e164?: string; // optional — clients usually don't need it, but RC bridge uses it
  scope?: string;
}

export async function signES256(payload: AccessTokenClaims, privateJwk: JwkEC): Promise<string> {
  if (!privateJwk.kid) throw new Error("privateJwk missing kid");
  const header = { alg: "ES256", typ: "JWT", kid: privateJwk.kid };
  const signingInput = b64uJSON(header) + "." + b64uJSON(payload);
  const key = await importPrivateKey(privateJwk);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput));
  return signingInput + "." + b64uEncode(sig);
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  jwksResolve: (kid: string) => Promise<JwkEC | null>;
  isJtiRevoked?: (jti: string) => Promise<boolean>;
  clockSkewSec?: number; // default 30
}

export interface VerifyResult {
  ok: boolean;
  reason?: string;
  claims?: AccessTokenClaims;
}

export async function verifyES256(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const skew = opts.clockSkewSec ?? 30;
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed_jwt" };
  const [h, p, s] = parts;
  if (!h || !p || !s) return { ok: false, reason: "malformed_jwt" };

  let header: { alg?: string; kid?: string; typ?: string };
  let payload: AccessTokenClaims;
  try {
    header = JSON.parse(dec.decode(b64uDecode(h)));
    payload = JSON.parse(dec.decode(b64uDecode(p)));
  } catch {
    return { ok: false, reason: "header_or_payload_unparseable" };
  }

  if (header.alg !== "ES256") return { ok: false, reason: "alg_mismatch" };
  if (header.typ && header.typ !== "JWT") return { ok: false, reason: "typ_mismatch" };
  if (!header.kid) return { ok: false, reason: "kid_missing" };

  const jwk = await opts.jwksResolve(header.kid);
  if (!jwk) return { ok: false, reason: "kid_unknown" };

  const now = Math.floor(Date.now() / 1000);
  if (payload.iss !== opts.issuer) return { ok: false, reason: "iss_mismatch" };
  if (payload.aud !== opts.audience) return { ok: false, reason: "aud_mismatch" };
  if (typeof payload.exp !== "number" || now > payload.exp + skew) {
    return { ok: false, reason: "expired" };
  }
  if (typeof payload.nbf === "number" && now + skew < payload.nbf) {
    return { ok: false, reason: "not_yet_valid" };
  }

  const key = await importPublicKey(jwk);
  const sig = b64uDecode(s);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig, enc.encode(h + "." + p));
  if (!valid) return { ok: false, reason: "signature_invalid" };

  if (opts.isJtiRevoked) {
    const revoked = await opts.isJtiRevoked(payload.jti);
    if (revoked) return { ok: false, reason: "jti_revoked" };
  }

  return { ok: true, claims: payload };
}

// ---------- opaque refresh tokens ----------
// Refresh tokens are NOT JWTs. They're 256-bit random opaque strings whose
// SHA-256 hash is stored in D1.refresh_tokens.token_hash. This keeps refresh
// tokens revocable in one DB write and forces a DB hit on every refresh.

export interface RefreshTokenIssued {
  raw: string; // give this to the client; you'll never see it again
  hash: string; // store this in D1
  jti: string; // PK in refresh_tokens
}

export async function issueRefreshToken(): Promise<RefreshTokenIssued> {
  const jti = crypto.randomUUID();
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  const raw = `${jti}.${b64uEncode(secret)}`;
  const hash = await sha256Hex(raw);
  return { raw, hash, jti };
}

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(s));
  const bytes = new Uint8Array(buf);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}
