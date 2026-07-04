import type { ChatRequest, ChatResponse, TtsRequest, TtsResponse } from "@aria/shared-types";
import type { D1Database, ExecutionContext } from "@cloudflare/workers-types";
import {
  generateAIResponse,
  detectCrisis,
  CRISIS_RESOURCES,
  ARIA_CRISIS_REPLY,
  applyTurnToMemory,
  createEmptyIntelligentMemory,
  extractTurnMemory,
  indexSemanticMemoryForTurn,
  deleteSemanticMemoryForUser,
  detectTampering,
} from "@aria/aria-core";
import {
  ensureUser,
  getRecentTurns,
  persistTurn,
  compileIntelligentMemory,
  persistTurnAndMemory,
  deleteAllUserData,
  exportAllUserData,
  getUserBan,
  banUser,
} from "./memory";
import {
  clientIp,
  handleAdminRotate,
  handleJwks,
  handleLogout,
  handleMe,
  handleRefresh,
  handleSendOtp,
  handleVerifyOtp,
  rateLimitGate,
  readBearer,
  type AuthEnv,
  type RateLimitBinding,
} from "./auth";
import { bumpChatUidDaily } from "./auth_db";

export interface Env extends AuthEnv {
  ENV: string;
  OPENAI_COMPAT_BASE_URL: string;
  OPENAI_COMPAT_MODEL: string;
  OPENAI_COMPAT_API_KEY: string;
  /** Phase-0 dev gate so /api/chat isn't open. Real auth lands in Phase 3. */
  DEV_SHARED_SECRET?: string;
  /** HeyGen LiveAvatar key (server-side only). Phase 0.5 sandbox de-risk. */
  LIVEAVATAR_API_KEY?: string;
  /** Phase 1 — shared D1 memory database. */
  DB: D1Database;
  /** Phase 1d — semantic memory: Gemini embeddings + Qdrant Cloud (optional;
   * absence = semantic recall gracefully off). */
  GEMINI_API_KEY?: string;
  QDRANT_URL?: string;
  QDRANT_API_KEY?: string;
  /** Phase 1e — psyche + safety toggles (default OFF; the psyche budget is
   * verified by test/psyche-safety.test.ts and fires only when these are on.
   * Flip on after the P2 adherence probe validates the renderer honors intent.
   * Read function-time by aria-core; bridged to process.env below. */
  PSYCHE_FOUNDATION_ENABLED?: string;
  PSYCHE_ARBITER_ENABLED?: string;
  PSYCHE_PLAN_BIAS_ENABLED?: string;
  PSYCHE_EMOTION_FORWARD_ENABLED?: string;
  /** SOUL B1 (#39) — inner-state block: the arbiter's want reaches the words. */
  PSYCHE_INNER_STATE_ENABLED?: string;
  MANIPULATION_GUARD_ENABLED?: string;
  /** Slice B — Cartesia TTS (server-side only). Absent => /api/tts returns 503 and
   * the web falls back to the silent lip-sync stub. Pick a warm female voice from the
   * Cartesia library and set CARTESIA_VOICE_ID to its UUID. */
  CARTESIA_API_KEY?: string;
  CARTESIA_VOICE_ID?: string;
  /** #13 — production rate limits, LIVE (volley 2026-06-22 F4; design:
   * docs/security/RATE_LIMITS_DESIGN_2026-07-01.md). Cloudflare Workers RateLimit
   * bindings declared in wrangler.toml [[unsafe.bindings]]. Kept OPTIONAL so a
   * binding-less local run still typechecks; rateLimitGate (src/auth.ts) fails
   * CLOSED outside dev when a binding is missing. The auth-endpoint bindings
   * (OTP send/verify + refresh) live on AuthEnv. */
  CHAT_IP_LIMIT?: RateLimitBinding;
  CHAT_UID_LIMIT?: RateLimitBinding;
  TTS_IP_LIMIT?: RateLimitBinding;
  TTS_UID_LIMIT?: RateLimitBinding;
  AVATAR_IP_LIMIT?: RateLimitBinding;
  AVATAR_UID_LIMIT?: RateLimitBinding;
  ACCOUNT_IP_LIMIT?: RateLimitBinding;
  ACCOUNT_UID_LIMIT?: RateLimitBinding;
  /** #13 — CORS origin allowlist (adjudication C1): comma-separated exact
   * origins. Unset in dev falls back to the local Vite origins; unset outside
   * dev means NO origin is allowed (deny by default). */
  ALLOWED_ORIGINS?: string;
  /** #13 — per-uid daily chat-turn ceiling (D1 chat_uid_daily; design §4). */
  CHAT_UID_DAILY_MAX?: string;
}

// HeyGen LiveAvatar free sandbox avatar (Wayne) — zero credits, ~1-min sessions.
const AVATAR_SANDBOX_WAYNE = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

// Default Cartesia voice — override per deployment via CARTESIA_VOICE_ID (the UUID of
// the warm female voice picked from the Cartesia voice library).
const DEFAULT_CARTESIA_VOICE = "6ccbfb76-1fc6-48f7-b71d-91ac6298247b";
const CARTESIA_SAMPLE_RATE = 44100;

// ── #13 CORS — origin allowlist (CORS_ADJUDICATION_2026-07-01.md conditions C1-C3).
// The wildcard `*` died with the dev-only auth model. Rules, enforced at ONE seam
// (withCors, applied to every response in fetch):
//   C1: reflect the request Origin ONLY when it is in the ALLOWED_ORIGINS
//       allowlist (+ `vary: origin`); non-matching/absent origin → NO
//       access-control-allow-origin header (deny by default). allow-headers is
//       content-type,authorization,x-turn-id — the x-dev-* names exist in dev ONLY.
//   C2: access-control-allow-credentials is NEVER emitted (cookie-free Bearer
//       design; if cookies are ever proposed, re-adjudicate first).
//   C3: regression assertions live in scripts/security (rate-limit/CORS probe).
const PROD_ALLOW_HEADERS = "content-type,authorization,x-turn-id";
const DEV_ALLOW_HEADERS = PROD_ALLOW_HEADERS + ",x-dev-secret,x-dev-uid";

function allowedOrigins(env: Env): Set<string> {
  const set = new Set(
    (env.ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  // Dev convenience only: an empty allowlist in dev = the local Vite origins.
  // Outside dev an empty allowlist stays empty — deny by default, fail closed.
  if (set.size === 0 && env.ENV === "dev") {
    set.add("http://localhost:5173");
    set.add("http://127.0.0.1:5173");
  }
  return set;
}

/** Single CORS seam — decorates EVERY response (incl. auth routes + preflight).
 * Emits ACAO/methods/headers only for an allowlisted Origin; always varies on
 * origin; never emits allow-credentials (C2). */
function withCors(res: Response, request: Request, env: Env): Response {
  const headers = new Headers(res.headers);
  headers.append("vary", "origin");
  const origin = request.headers.get("origin");
  if (origin && allowedOrigins(env).has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "GET,POST,OPTIONS");
    headers.set("access-control-allow-headers", env.ENV === "dev" ? DEV_ALLOW_HEADERS : PROD_ALLOW_HEADERS);
    headers.set("access-control-max-age", "600");
  }
  // C2 — belt-and-braces: nothing sets this header; make sure nothing ever does.
  headers.delete("access-control-allow-credentials");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Baseline security headers (audit 2026-06-22). This is a pure JSON API (serves no
// HTML), so a deny-all CSP + nosniff + no-referrer + frame-deny are safe and close
// the "no security headers" gap without affecting behavior.
const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...SECURITY_HEADERS },
  });
}

/**
 * Dev gate — the DEV-MODE-ONLY alternative to Bearer auth (#13). FAILS CLOSED:
 * not dev -> 401 (production requires Bearer — see authenticate());
 * DEV_SHARED_SECRET unset -> 503 (an unset secret must fail closed, not leave a
 * zero-auth endpoint open); wrong/missing secret -> 403. Returns a Response when
 * blocked, or null to proceed. Only reachable from authenticate()'s dev branch.
 */
function devGate(request: Request, env: Env): Response | null {
  if (env.ENV !== "dev") {
    return json({ success: false, error: "auth_required", detail: "Bearer access token required" }, 401);
  }
  if (!env.DEV_SHARED_SECRET) {
    return json(
      { success: false, error: "dev_secret_unset", detail: "set DEV_SHARED_SECRET so dev fails closed" },
      503,
    );
  }
  if (request.headers.get("x-dev-secret") !== env.DEV_SHARED_SECRET) {
    return json({ success: false, error: "forbidden" }, 403);
  }
  return null;
}

/**
 * #13 — production identity for the /api/* endpoints. Bearer-first:
 *   - `Authorization: Bearer <access>` present (any env) → full ES256 verify
 *     (issuer, audience, exp, nbf, kid allowlist, jti revocation — readBearer)
 *     and uid = the verified `sub` claim. Closes volley F8 (client-writable uid).
 *   - No Bearer + ENV !== "dev" → 401 auth_required. The dev headers are DEAD
 *     outside dev: x-dev-secret/x-dev-uid are never consulted.
 *   - No Bearer + ENV === "dev" → devGate (x-dev-secret) + bounded x-dev-uid —
 *     the dev-mode-only alternative path, preserving the local workflow.
 * Returns the acting uid or the blocking Response.
 */
async function authenticate(request: Request, env: Env): Promise<{ uid: string } | Response> {
  const authz = request.headers.get("authorization");
  if (authz && authz.startsWith("Bearer ")) {
    const r = await readBearer(request, env);
    if (r instanceof Response) return r;
    return { uid: r.claims.sub };
  }
  if (env.ENV !== "dev") {
    return json({ success: false, error: "auth_required", detail: "Bearer access token required" }, 401);
  }
  const blocked = devGate(request, env);
  if (blocked) return blocked;
  const uid = resolveUid(request);
  if (uid === null) return json({ success: false, error: "uid_invalid" }, 400);
  return { uid };
}

// Bounded-input caps (issue #9 — every client-controlled string that reaches D1 or
// an upstream API gets an explicit bound; unbounded input is an abuse signal).
const MAX_BODY_BYTES = 64 * 1024; // any JSON body larger than this is not a real request
const MAX_UID_LEN = 128; // x-dev-uid is persisted as the D1 uid key — bound it
const TURN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/; // x-turn-id becomes D1 row ids — bound + charset

/** Reject oversized bodies before parsing (declared content-length; the chat/tts
 * field-level caps below remain the authoritative bound after parse). */
function bodyTooLarge(request: Request): Response | null {
  const len = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    return json({ success: false, error: "payload_too_large" }, 413);
  }
  return null;
}

/**
 * Resolve the acting uid from the x-dev-uid header — DEV-MODE-ONLY (#13 done):
 * only reachable from authenticate()'s dev branch, behind devGate. Production
 * identity is the Bearer `sub` claim (volley F8 closed). Bounded so an
 * unbounded string can never become a D1 key (null = reject 400).
 */
function resolveUid(request: Request): string | null {
  const raw = request.headers.get("x-dev-uid");
  if (raw === null || raw === "") return "dev-user";
  if (raw.length > MAX_UID_LEN) return null;
  return raw;
}

// Terminal response for a banned user (zero-tolerance tampering ban). Generic to the
// client — the reason/signal lives only in the ban_audit table, never leaked here.
function suspended(): Response {
  return json(
    {
      success: false,
      error: "account_suspended",
      detail: "This account has been permanently suspended for violating the terms of use.",
    },
    403,
  );
}

/**
 * Bridge the Worker `env` into `process.env` (nodejs_compat) so the brain's
 * FUNCTION-TIME env reads (openaiCompat: base-url/key/model) resolve. The brain
 * reads OPENAI_BASE_URL / OPENAI_COMPAT_API_KEY / OPENAI_API_KEY / OPENAI_DEFAULT_MODEL;
 * the Worker carries them as OPENAI_COMPAT_*, so we map the names here.
 *
 * NOTE: the brain's MODULE-EVAL flag consts (FAST_PATH_GEMINI/ANTHROPIC_PRIMARY,
 * the secondary-model consts) are captured at import — before this shim — so they
 * use their defaults (Phase-0: OPENAI_COMPAT primary, Gemini/Anthropic off). Live
 * model-routing for the secondary calls is tuned at `wrangler dev` time.
 */
function bridgeEnv(env: Env): void {
  const p = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (!p || !p.env) return;
  p.env.OPENAI_BASE_URL = env.OPENAI_COMPAT_BASE_URL;
  p.env.OPENAI_COMPAT_API_KEY = env.OPENAI_COMPAT_API_KEY;
  p.env.OPENAI_API_KEY = env.OPENAI_COMPAT_API_KEY; // fallback path
  p.env.OPENAI_DEFAULT_MODEL = env.OPENAI_COMPAT_MODEL;
  // Phase 1d — semantic memory (aria-core reads these at call time for Gemini
  // embeddings + Qdrant). Absent => semantic recall/index gracefully no-op.
  if (env.GEMINI_API_KEY) p.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  if (env.QDRANT_URL) p.env.QDRANT_URL = env.QDRANT_URL;
  if (env.QDRANT_API_KEY) p.env.QDRANT_API_KEY = env.QDRANT_API_KEY;
  // Phase 1e — psyche + safety toggles (only passed through when explicitly set,
  // so unset stays default-OFF and production is byte-identical).
  for (const k of [
    "PSYCHE_FOUNDATION_ENABLED",
    "PSYCHE_ARBITER_ENABLED",
    "PSYCHE_PLAN_BIAS_ENABLED",
    "PSYCHE_EMOTION_FORWARD_ENABLED",
    "PSYCHE_INNER_STATE_ENABLED",
    "MANIPULATION_GUARD_ENABLED",
  ] as const) {
    const v = env[k];
    if (v !== undefined) p.env[k] = v;
  }
}

// ── Phase 1e — minimal spend/trace. Rough per-1M-token USD rates by model. The
// brain's RICH per-turn log (model/route/quality/timings) lives in aria-core's
// "AI response generated" logInfo; this adds the missing cost signal so dev isn't
// flying blind. NOTE: it's a deliberate ESTIMATE — it counts the visible turn
// text only (the brain's internal system prompt + its helper calls — extraction,
// critic, persona-audit, recall-embed — are NOT itemized), so it's a LOWER BOUND.
// Exact provider-usage cost (completion.usage threaded to qualityMeta) is tracked
// as a follow-up for when spend matters at scale.
const COST_PER_M: Array<{ match: RegExp; in: number; out: number }> = [
  { match: /deepseek/i, in: 0.27, out: 1.1 },
  { match: /gpt-4o-mini/i, in: 0.15, out: 0.6 },
  { match: /gpt-4o/i, in: 2.5, out: 10 },
  { match: /gemini.*flash/i, in: 0.075, out: 0.3 },
];
function estTokens(s: string): number {
  return Math.ceil((s?.length ?? 0) / 4); // ~chars/4 (English)
}
function estCostUsd(model: string, tokIn: number, tokOut: number): number {
  const row = COST_PER_M.find((r) => r.match.test(model)) ?? { in: 1, out: 3 };
  return (tokIn * row.in + tokOut * row.out) / 1e6;
}

// #27 — privacy-safe error taxonomy for logs. Categories + a BOUNDED infra
// message only; NEVER user/message content (the intimate-data boundary:
// docs/observability/OBSERVABILITY.md).
function errCategory(err: unknown): string {
  const s = String(err);
  if (/timeout|abort/i.test(s)) return "timeout";
  if (/fetch|network|econn|socket|dns/i.test(s)) return "network";
  if (/d1|sqlite|sql|database/i.test(s)) return "db";
  if (/401|403|unauthorized|token|jwt/i.test(s)) return "auth";
  if (/429|rate/i.test(s)) return "rate-limit";
  return "internal";
}
const errLog = (reqId: string, err: unknown) => ({
  reqId,
  cat: errCategory(err),
  error: String(err).slice(0, 200),
});

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // #13 — CORS conditions C1-C3 are enforced at this single seam so EVERY
    // response (api, auth, preflight, 404, errors) carries the same policy.
    // #27 — per-request id at the SAME seam: every error log carries reqId and
    // every response echoes x-request-id, so a user report ("it broke at 9:14")
    // correlates to exact log lines without logging any content.
    const reqId = crypto.randomUUID().slice(0, 8);
    const res = await routeRequest(request, env, ctx, reqId);
    const out = new Response(res.body, res); // fresh Response => mutable headers
    out.headers.set("x-request-id", reqId);
    return withCors(out, request, env);
  },
};

async function routeRequest(request: Request, env: Env, ctx: ExecutionContext, reqId: string): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: SECURITY_HEADERS });
    if (url.pathname === "/healthz") return json({ ok: true, env: env.ENV });

    // ── #13 — auth endpoints (ported from the auth spike; src/auth.ts). ──────
    // CORS comes from the seam above; rate limits live inside the handlers.
    if (url.pathname === "/.well-known/jwks.json" && request.method === "GET") return handleJwks(request, env);
    if (url.pathname === "/v1/auth/otp/send" && request.method === "POST") return handleSendOtp(request, env);
    if (url.pathname === "/v1/auth/otp/verify" && request.method === "POST") return handleVerifyOtp(request, env);
    if (url.pathname === "/v1/auth/refresh" && request.method === "POST") return handleRefresh(request, env);
    if (url.pathname === "/v1/auth/logout" && request.method === "POST") return handleLogout(request, env);
    if (url.pathname === "/v1/me" && request.method === "GET") return handleMe(request, env);
    if (url.pathname === "/v1/admin/keys/rotate" && request.method === "POST") return handleAdminRotate(request, env);

    if (url.pathname === "/api/chat" && request.method === "POST") {
      // SECURITY (#13): identity = verified Bearer `sub` via authenticate();
      // the x-dev-uid path survives ONLY in dev behind devGate (volley F8 closed).
      // Per-IP rate limit FIRST (before any parsing/crypto — bounds flood cost;
      // JWT verify costs an ES256 op, so the IP gate also bounds crypto-DoS).
      const ipLimited = await rateLimitGate(env, env.CHAT_IP_LIMIT, "chat_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const auth = await authenticate(request, env);
      if (auth instanceof Response) return auth;
      const oversized = bodyTooLarge(request);
      if (oversized) return oversized;

      let body: ChatRequest;
      try {
        body = (await request.json()) as ChatRequest;
      } catch {
        return json({ success: false, error: "bad_request" }, 400);
      }
      if (!body || typeof body.message !== "string" || body.message.length === 0) {
        return json({ success: false, error: "message_required" }, 400);
      }
      // Length cap (audit 2026-06-22 F4) — bounds token-flood cost-DoS against the LLM.
      // 4000 chars is generous for chat; longer is an abuse signal, not a real turn.
      // Per-turn cost is further bounded by the 20-turn history window + the 1200-char
      // TTS slice + the per-uid DAILY turn ceiling below (#13; design §4).
      if (body.message.length > 4000) {
        return json({ success: false, error: "message_too_long" }, 413);
      }

      // Accept a client idempotency key so a retried turn reuses the same id:
      // chat_turns + scored_messages are ON CONFLICT idempotent and
      // applyTurnToMemory replay-guards the fat-doc on the same turnId. Bounded
      // (issue #9): a non-conforming header just loses idempotency, never lands
      // an unbounded/odd-charset string in D1 row ids.
      const turnIdHeader = request.headers.get("x-turn-id");
      const turnId = turnIdHeader && TURN_ID_RE.test(turnIdHeader) ? turnIdHeader : crypto.randomUUID();
      const nowMs = Date.now();
      // #13: uid is the server-derived identity from authenticate() — the Bearer
      // `sub` claim in production, the bounded x-dev-uid only in dev (F8 closed).
      const uid = auth.uid;
      // Per-uid rate limit (issue #9; LIVE — wrangler.toml bindings active).
      const uidLimited = await rateLimitGate(env, env.CHAT_UID_LIMIT, "chat_uid:" + uid);
      if (uidLimited) return uidLimited;

      try {
        await ensureUser(env.DB, uid, nowMs);

        // Zero-tolerance ban (2026-06-22): a banned user is locked out of every
        // interactive endpoint. Checked before any work.
        if ((await getUserBan(env.DB, uid)).banned) return suspended();

        // 1) Crisis HARD GATE — runs BEFORE the brain. Pure regex; short-circuits.
        // ALSO the safety boundary for the ban: crisis runs FIRST so a self-harm
        // message can NEVER be treated as tampering.
        const crisis = detectCrisis(body.message);
        if (crisis.severity !== "none" && crisis.category) {
          const resources = CRISIS_RESOURCES[crisis.category] ?? CRISIS_RESOURCES.severe_distress;
          // Deterministic ids so a retried crisis turn is idempotent (no dup log rows).
          await persistTurn(env.DB, uid, "user", body.message, nowMs, {}, `${turnId}_user`);
          await persistTurn(env.DB, uid, "assistant", ARIA_CRISIS_REPLY, nowMs + 1, {
            emotion: "concerned", emotionTrigger: "concerned", emotionIntensity: 0.6, modelUsed: "crisis-gate",
          }, `${turnId}_assistant`);
          const res: ChatResponse = {
            success: true,
            messageId: turnId,
            response: ARIA_CRISIS_REPLY,
            emotion: "concerned",
            emotionTrigger: "concerned",
            emotionIntensity: 0.6,
            crisis: {
              severity: crisis.severity,
              category: crisis.category,
              resources: { items: resources },
              ariaReply: ARIA_CRISIS_REPLY,
            },
          };
          return json(res);
        }

        // 1.5) FIRST-STRIKE tampering ban. AFTER the crisis gate (self-harm is never
        // tampering). detectTampering matches ONLY canonical jailbreak / system-prompt-
        // extraction signatures (near-zero false-positive) — intimate / emotional /
        // roleplay content does not trip it. One strike -> permanent ban + lockout.
        const tamper = detectTampering(body.message);
        if (tamper.tampering) {
          await banUser(env.DB, uid, "prompt-injection", tamper.patterns.join(","), nowMs);
          console.warn("ban.tampering", { uid, patterns: tamper.patterns });
          return suspended();
        }

        // 1.7) #13 — per-uid DAILY turn ceiling (D1 chat_uid_daily; design §4).
        // The "money" bound on the LLM cost sink: the 60s windows above only bound
        // velocity. Deliberately AFTER the crisis gate (a person in crisis always
        // gets the 988 card — the crisis path is regex + two D1 writes, no LLM) and
        // BEFORE any brain spend. 429 carries retry-after = seconds to UTC midnight.
        const dailyMax = Number.parseInt(env.CHAT_UID_DAILY_MAX ?? "", 10) || 500;
        const dailyCount = await bumpChatUidDaily(env.DB, uid);
        if (dailyCount > dailyMax) {
          const nowSec = Math.floor(nowMs / 1000);
          const secToUtcMidnight = 86400 - (nowSec % 86400);
          console.warn("chat.daily_ceiling", { uid, dailyCount, dailyMax });
          return new Response(JSON.stringify({ success: false, error: "rate_limited" }), {
            status: 429,
            headers: {
              "content-type": "application/json",
              "retry-after": String(secToUtcMidnight),
              ...SECURITY_HEADERS,
            },
          });
        }

        // 2) Real Aria turn. Hydrate recent conversation from D1 as the brain's
        //    short-term `conversationHistory` (read BEFORE persisting the current
        //    message), AND hydrate the structured long-term memory (Phase 1b) to
        //    inject at the brain's single read seam (bootstrapConversationRuntime).
        bridgeEnv(env);
        const history = await getRecentTurns(env.DB, uid, 20);
        const memory = await compileIntelligentMemory(env.DB, uid);
        const genStart = Date.now();
        const ai = await generateAIResponse(
          body.message,
          history,
          uid,
          undefined, // temporalContextInput
          undefined, // chatMode
          undefined, // datesContextBlock
          undefined, // userEnvCtx
          undefined, // featureSettings
          turnId,
          { memory }, // Phase 1b — inject the hydrated long-term memory
        );
        // Phase 1c — the per-turn memory extraction (importance scoring + fact/
        // emotion extraction, gated by the write-gate) runs SYNCHRONOUSLY before the
        // response. This keeps the turn's atomic persist FAILURE-VISIBLE (a D1 error
        // -> the outer catch -> 500 -> the client retries against the idempotent
        // ids) and guarantees turn N is committed before turn N+1 can hydrate (no
        // same-uid lost-update). It costs extraction latency on the response; moving
        // extraction off the response path (with per-uid serialization + a retry/
        // dead-letter) is a Phase-3 item once the realtime Durable Object provides
        // per-uid ordering.
        const extracted = await extractTurnMemory({
          userMessage: body.message,
          aiResponse: ai.content,
          existingCoreFacts: memory?.coreFacts ?? [],
          nowMs,
        });
        const memoryBase = memory ?? createEmptyIntelligentMemory(uid, nowMs);
        const updatedMemory = applyTurnToMemory(memoryBase, {
          turnId,
          userMessage: body.message,
          aiResponse: ai.content,
          nowMs,
          meta: {
            timeZoneOffsetMinutes: body.clientTime?.timeZoneOffsetMinutes,
            timeZoneName: body.clientTime?.timeZoneName,
          },
          scoring: extracted.scoring,
          extraction: extracted.extraction,
        });
        const newScored = updatedMemory.scoredMessages.filter(
          (m) => m.id === `${turnId}_user` || m.id === `${turnId}_ai`,
        );
        await persistTurnAndMemory(env.DB, uid, {
          turnId,
          userMessage: body.message,
          aiResponse: ai.content,
          nowMs,
          assistantMeta: {
            emotion: ai.emotion,
            emotionTrigger: ai.emotionTrigger,
            emotionIntensity: ai.emotionIntensity,
            modelUsed: ai.modelUsed,
          },
          memory: updatedMemory,
          newScored,
        });

        // Phase 1d — index this turn into Qdrant for future semantic recall. This
        // is best-effort ENRICHMENT (not the authoritative memory: chat_turns +
        // intelligent_memory already committed synchronously above), so unlike the
        // persist it correctly runs in ctx.waitUntil — no response latency, and a
        // failed index just means this turn isn't semantically searchable, never a
        // forgotten turn. No-ops gracefully when Qdrant/Gemini aren't configured.
        ctx.waitUntil(
          indexSemanticMemoryForTurn(
            uid,
            turnId,
            body.message,
            ai.content,
            extracted.scoring.topics,
            extracted.scoring.userImportance,
            extracted.scoring.aiImportance,
          ).catch((err) => console.error("semantic index failed", { uid, turnId, ...errLog(reqId, err) })),
        );

        // Phase 1e — minimal per-turn spend trace (estimate; see COST_PER_M note).
        const estTokensIn =
          estTokens(body.message) + history.reduce((n, m) => n + estTokens(m.content), 0);
        const estTokensOut = estTokens(ai.content);
        const meta = (ai.qualityMeta ?? {}) as Record<string, unknown>;
        console.info("turn.spend", {
          uid,
          turnId,
          model: ai.modelUsed,
          route: meta.route,
          genMs: Date.now() - genStart,
          estTokensIn,
          estTokensOut,
          estCostUsd: Number(estCostUsd(ai.modelUsed ?? "", estTokensIn, estTokensOut).toFixed(6)),
          memoryRecalled: !!(env.QDRANT_URL && env.GEMINI_API_KEY),
          turnTopics: extracted.scoring.topics.length,
        });

        const res: ChatResponse = {
          success: true,
          messageId: turnId,
          response: ai.content,
          emotion: ai.emotion,
          emotionTrigger: ai.emotionTrigger,
          emotionIntensity: ai.emotionIntensity,
          qualityMeta: ai.qualityMeta as Record<string, unknown> | undefined,
        };
        return json(res);
      } catch (err) {
        console.error("chat turn failed", errLog(reqId, err));
        // Don't echo the raw error to the client — it can carry internal URLs/keys.
        // The full error is in the server log above.
        return json({ success: false, error: "brain_error" }, 500);
      }
    }

    // Phase 0.5 — LiveAvatar LITE sandbox session mint. Keeps X-API-KEY server-side;
    // returns ONLY browser-safe tokens (viewer LiveKit token + room URL + control WS).
    // The agent token + api key never reach the browser.
    if (url.pathname === "/api/avatar/session" && request.method === "POST") {
      // Fail closed (this spends our LiveAvatar credits; not public).
      const ipLimited = await rateLimitGate(env, env.AVATAR_IP_LIMIT, "avatar_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const auth = await authenticate(request, env); // #13: Bearer `sub` (dev fallback behind devGate)
      if (auth instanceof Response) return auth;
      const uid = auth.uid;
      const uidLimited = await rateLimitGate(env, env.AVATAR_UID_LIMIT, "avatar_uid:" + uid);
      if (uidLimited) return uidLimited;
      if ((await getUserBan(env.DB, uid)).banned) return suspended();
      if (!env.LIVEAVATAR_API_KEY) return json({ success: false, error: "avatar_not_configured" }, 503);
      try {
        const tokRes = await fetch("https://api.liveavatar.com/v1/sessions/token", {
          method: "POST",
          headers: { "x-api-key": env.LIVEAVATAR_API_KEY, "content-type": "application/json" },
          body: JSON.stringify({ mode: "LITE", avatar_id: AVATAR_SANDBOX_WAYNE, is_sandbox: true }),
        });
        const tok = (await tokRes.json()) as { data?: { session_token?: string } };
        const sessionToken = tok?.data?.session_token;
        if (!sessionToken) return json({ success: false, error: "token_mint_failed", detail: tok }, 502);

        const startRes = await fetch("https://api.liveavatar.com/v1/sessions/start", {
          method: "POST",
          headers: { authorization: `Bearer ${sessionToken}`, "content-type": "application/json" },
          body: JSON.stringify({}),
        });
        const start = (await startRes.json()) as {
          data?: {
            session_id?: string;
            livekit_url?: string;
            livekit_client_token?: string;
            ws_url?: string;
            max_session_duration?: number;
          };
        };
        const d = start?.data;
        if (!d?.livekit_url || !d?.livekit_client_token) {
          return json({ success: false, error: "start_failed", detail: start }, 502);
        }
        return json({
          success: true,
          session_id: d.session_id,
          livekit_url: d.livekit_url,
          livekit_client_token: d.livekit_client_token,
          ws_url: d.ws_url,
          max_session_duration: d.max_session_duration,
        });
      } catch (err) {
        console.error("avatar session failed", errLog(reqId, err));
        return json({ success: false, error: "avatar_error" }, 500);
      }
    }

    // Slice B — TTS proxy. Aria's reply text → her voice via Cartesia. Keeps the API
    // key server-side; returns base64 RAW PCM the web decodes into an AudioBuffer.
    // 503 when unconfigured so the web falls back to the silent lip-sync stub.
    if (url.pathname === "/api/tts" && request.method === "POST") {
      const ipLimited = await rateLimitGate(env, env.TTS_IP_LIMIT, "tts_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const auth = await authenticate(request, env); // #13: Bearer `sub` (dev fallback behind devGate)
      if (auth instanceof Response) return auth;
      const uid = auth.uid;
      const uidLimited = await rateLimitGate(env, env.TTS_UID_LIMIT, "tts_uid:" + uid);
      if (uidLimited) return uidLimited;
      if ((await getUserBan(env.DB, uid)).banned) return suspended();
      if (!env.CARTESIA_API_KEY) return json({ success: false, error: "tts_not_configured" }, 503);
      const oversized = bodyTooLarge(request);
      if (oversized) return oversized;

      let body: TtsRequest;
      try {
        body = (await request.json()) as TtsRequest;
      } catch {
        return json({ success: false, error: "bad_request" }, 400);
      }
      const text = (body?.text ?? "").trim();
      if (!text) return json({ success: false, error: "text_required" }, 400);
      const capped = text.slice(0, 1200); // bound payload + cost

      try {
        const ct = await fetch("https://api.cartesia.ai/tts/bytes", {
          method: "POST",
          headers: {
            "X-API-Key": env.CARTESIA_API_KEY,
            "Cartesia-Version": "2025-04-16",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model_id: "sonic-2",
            transcript: capped,
            voice: { mode: "id", id: env.CARTESIA_VOICE_ID || DEFAULT_CARTESIA_VOICE },
            output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: CARTESIA_SAMPLE_RATE },
            language: "en",
          }),
        });
        if (!ct.ok) {
          // Log detail server-side only; the client gets a generic error (no upstream
          // status/body leak — Cartesia's error semantics stay private).
          const detail = (await ct.text().catch(() => "")).slice(0, 200);
          console.error("cartesia tts failed", { reqId, cat: "provider", status: ct.status, detail });
          return json({ success: false, error: "tts_upstream" }, 502);
        }
        const bytes = new Uint8Array(await ct.arrayBuffer());
        if (bytes.byteLength === 0) return json({ success: false, error: "tts_empty" }, 502);
        // nodejs_compat provides Buffer; base64 without the btoa(String.fromCharCode(...))
        // overflow on large PCM.
        const audio = Buffer.from(bytes).toString("base64");
        // /tts/bytes with container:"raw" returns HEADERLESS PCM — there's no format to
        // parse back, so we echo the format we REQUESTED (Cartesia honors output_format).
        const res: TtsResponse = {
          success: true,
          audio,
          encoding: "pcm_s16le",
          sampleRate: CARTESIA_SAMPLE_RATE,
        };
        return json(res);
      } catch (err) {
        console.error("tts error", errLog(reqId, err));
        return json({ success: false, error: "tts_error" }, 500);
      }
    }

    // M2 (audit 2026-06-22) — GDPR/CCPA right-to-erasure. Purges the user from D1
    // (all uid-scoped tables, one transaction) + Qdrant (semantic vectors). devGate
    // fails closed; real per-user auth is Phase 3 (uid = x-dev-uid for now). No R2
    // binding on this worker yet — when audio/blobs move to R2, add its purge here.
    if (url.pathname === "/api/account/delete" && request.method === "POST") {
      const ipLimited = await rateLimitGate(env, env.ACCOUNT_IP_LIMIT, "account_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const auth = await authenticate(request, env); // #13: Bearer `sub` — delete is self-only now
      if (auth instanceof Response) return auth;
      const uid = auth.uid;
      const uidLimited = await rateLimitGate(env, env.ACCOUNT_UID_LIMIT, "account_uid:" + uid);
      if (uidLimited) return uidLimited;
      try {
        await deleteAllUserData(env.DB, uid);
        const qdrantOk = await deleteSemanticMemoryForUser(uid);
        return json({ success: true, uid, purged: { d1: true, qdrant: qdrantOk, r2: "n/a" } });
      } catch (err) {
        console.error("account delete failed", errLog(reqId, err));
        return json({ success: false, error: "delete_failed" }, 500);
      }
    }

    // M2 — data portability: export the user's stored data.
    if (url.pathname === "/api/account/export" && (request.method === "GET" || request.method === "POST")) {
      const ipLimited = await rateLimitGate(env, env.ACCOUNT_IP_LIMIT, "account_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const auth = await authenticate(request, env); // #13: Bearer `sub` — export is self-only now
      if (auth instanceof Response) return auth;
      const uid = auth.uid;
      const uidLimited = await rateLimitGate(env, env.ACCOUNT_UID_LIMIT, "account_uid:" + uid);
      if (uidLimited) return uidLimited;
      try {
        const data = await exportAllUserData(env.DB, uid, Date.now());
        return json({ success: true, data });
      } catch (err) {
        console.error("account export failed", errLog(reqId, err));
        return json({ success: false, error: "export_failed" }, 500);
      }
    }

    return json({ success: false, error: "not_found" }, 404);
}
