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

export interface Env {
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
  MANIPULATION_GUARD_ENABLED?: string;
  /** Slice B — Cartesia TTS (server-side only). Absent => /api/tts returns 503 and
   * the web falls back to the silent lip-sync stub. Pick a warm female voice from the
   * Cartesia library and set CARTESIA_VOICE_ID to its UUID. */
  CARTESIA_API_KEY?: string;
  CARTESIA_VOICE_ID?: string;
  /** TODO(#13) — production rate limits (volley 2026-06-22 F4; design:
   * docs/security/RATE_LIMITS_DESIGN_2026-07-01.md). Cloudflare Workers RateLimit
   * bindings, declared in wrangler.toml [[unsafe.bindings]] at auth integration.
   * OPTIONAL so today's dev worker (no bindings) typechecks + runs unchanged; the
   * rateLimitGate helper fails CLOSED outside dev when a binding is missing. */
  CHAT_IP_LIMIT?: RateLimitBinding;
  CHAT_UID_LIMIT?: RateLimitBinding;
  TTS_IP_LIMIT?: RateLimitBinding;
  TTS_UID_LIMIT?: RateLimitBinding;
  AVATAR_IP_LIMIT?: RateLimitBinding;
  AVATAR_UID_LIMIT?: RateLimitBinding;
  ACCOUNT_IP_LIMIT?: RateLimitBinding;
  ACCOUNT_UID_LIMIT?: RateLimitBinding;
}

/** Minimal Cloudflare Workers RateLimit binding shape (same alias the auth spike
 * uses — spikes/cloudflare-auth-spike-A/src/worker.ts). */
interface RateLimitBinding {
  limit(opts: { key: string }): Promise<{ success: boolean }>;
}

// HeyGen LiveAvatar free sandbox avatar (Wayne) — zero credits, ~1-min sessions.
const AVATAR_SANDBOX_WAYNE = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

// Default Cartesia voice — override per deployment via CARTESIA_VOICE_ID (the UUID of
// the warm female voice picked from the Cartesia voice library).
const DEFAULT_CARTESIA_VOICE = "6ccbfb76-1fc6-48f7-b71d-91ac6298247b";
const CARTESIA_SAMPLE_RATE = 44100;

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-dev-secret,x-dev-uid",
};

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
    headers: { "content-type": "application/json", ...CORS, ...SECURITY_HEADERS },
  });
}

/**
 * Dev gate for the private endpoints. FAILS CLOSED: not dev -> 401 (real auth is
 * Phase 3); DEV_SHARED_SECRET unset -> 503 (an unset secret must fail closed, not
 * leave a zero-auth endpoint open); wrong/missing secret -> 403. Returns a
 * Response when blocked, or null to proceed.
 */
function devGate(request: Request, env: Env): Response | null {
  if (env.ENV !== "dev") {
    return json({ success: false, error: "auth_required", detail: "real auth lands in Phase 3" }, 401);
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
 * Rate-limit gate (volley 2026-06-22 F4 / issue #9). INERT in dev today: the
 * bindings are not declared in wrangler.toml yet, so `binding` is undefined and
 * dev proceeds (devGate is the dev protection). The moment ENV != "dev" a missing
 * binding FAILS CLOSED (503) — production must never run without its limits.
 * TODO(#13): declare the [[unsafe.bindings]] in wrangler.toml at auth integration
 * per docs/security/RATE_LIMITS_DESIGN_2026-07-01.md, then this goes live as-is.
 */
async function rateLimitGate(
  env: Env,
  binding: RateLimitBinding | undefined,
  key: string,
): Promise<Response | null> {
  if (!binding) {
    if (env.ENV !== "dev") {
      return json({ success: false, error: "rate_limit_unconfigured" }, 503);
    }
    return null; // dev without bindings — inert
  }
  const { success } = await binding.limit({ key });
  if (!success) {
    return new Response(JSON.stringify({ success: false, error: "rate_limited" }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": "60", ...CORS, ...SECURITY_HEADERS },
    });
  }
  return null;
}

/** Client IP for per-IP limit keys (same derivation as the auth spike). */
function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? request.headers.get("x-forwarded-for") ?? "unknown";
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
 * Resolve the acting uid. TODO(#13): replace with the server-derived `sub` claim
 * from the Bearer access token (spikes/cloudflare-auth-spike-A readBearer) — the
 * x-dev-uid header dies with the dev gate (volley F8). Until then: bound the
 * header so an unbounded string can never become a D1 key (null = reject 400).
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: { ...CORS, ...SECURITY_HEADERS } });
    if (url.pathname === "/healthz") return json({ ok: true, env: env.ENV });

    if (url.pathname === "/api/chat" && request.method === "POST") {
      // SECURITY (Phase 0/1): this endpoint derives uid from the x-dev-uid header
      // and defaults to a shared "dev-user" — an IDOR/cross-tenant pattern that is
      // ONLY acceptable for local single-developer dev. Real phone-OTP auth +
      // server-derived uid land in Phase 3. devGate fails closed before any work.
      // Per-IP rate limit FIRST (before any parsing/crypto — bounds flood cost);
      // inert in dev until the #13 bindings land, fails closed outside dev.
      const ipLimited = await rateLimitGate(env, env.CHAT_IP_LIMIT, "chat_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const blocked = devGate(request, env);
      if (blocked) return blocked;
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
      // TTS slice. TODO(#13): add the per-uid DAILY turn/cost ceiling (D1 counter) per
      // docs/security/RATE_LIMITS_DESIGN_2026-07-01.md §4.
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
      // Phase 1a: per-user conversation memory. Real phone-OTP auth is Phase 3;
      // for dev the client may set x-dev-uid to keep separate conversations.
      // TODO(#13): uid becomes the Bearer token `sub` claim (volley F8 closes).
      const uid = resolveUid(request);
      if (uid === null) return json({ success: false, error: "uid_invalid" }, 400);
      // Per-uid rate limit (issue #9; inert until #13 bindings — see rateLimitGate).
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
          ).catch((err) => console.error("semantic index failed", { uid, turnId, error: String(err) })),
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
        console.error("chat turn failed", { error: String(err) });
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
      const blocked = devGate(request, env);
      if (blocked) return blocked;
      const uid = resolveUid(request); // TODO(#13): Bearer `sub`
      if (uid === null) return json({ success: false, error: "uid_invalid" }, 400);
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
        console.error("avatar session failed", { error: String(err) });
        return json({ success: false, error: "avatar_error" }, 500);
      }
    }

    // Slice B — TTS proxy. Aria's reply text → her voice via Cartesia. Keeps the API
    // key server-side; returns base64 RAW PCM the web decodes into an AudioBuffer.
    // 503 when unconfigured so the web falls back to the silent lip-sync stub.
    if (url.pathname === "/api/tts" && request.method === "POST") {
      const ipLimited = await rateLimitGate(env, env.TTS_IP_LIMIT, "tts_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const blocked = devGate(request, env);
      if (blocked) return blocked;
      const uid = resolveUid(request); // TODO(#13): Bearer `sub`
      if (uid === null) return json({ success: false, error: "uid_invalid" }, 400);
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
          console.error("cartesia tts failed", { status: ct.status, detail });
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
        console.error("tts error", { error: String(err) });
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
      const blocked = devGate(request, env);
      if (blocked) return blocked;
      const uid = resolveUid(request); // TODO(#13): Bearer `sub` — delete becomes self-only
      if (uid === null) return json({ success: false, error: "uid_invalid" }, 400);
      const uidLimited = await rateLimitGate(env, env.ACCOUNT_UID_LIMIT, "account_uid:" + uid);
      if (uidLimited) return uidLimited;
      try {
        await deleteAllUserData(env.DB, uid);
        const qdrantOk = await deleteSemanticMemoryForUser(uid);
        return json({ success: true, uid, purged: { d1: true, qdrant: qdrantOk, r2: "n/a" } });
      } catch (err) {
        console.error("account delete failed", { error: String(err) });
        return json({ success: false, error: "delete_failed" }, 500);
      }
    }

    // M2 — data portability: export the user's stored data.
    if (url.pathname === "/api/account/export" && (request.method === "GET" || request.method === "POST")) {
      const ipLimited = await rateLimitGate(env, env.ACCOUNT_IP_LIMIT, "account_ip:" + clientIp(request));
      if (ipLimited) return ipLimited;
      const blocked = devGate(request, env);
      if (blocked) return blocked;
      const uid = resolveUid(request); // TODO(#13): Bearer `sub` — export becomes self-only
      if (uid === null) return json({ success: false, error: "uid_invalid" }, 400);
      const uidLimited = await rateLimitGate(env, env.ACCOUNT_UID_LIMIT, "account_uid:" + uid);
      if (uidLimited) return uidLimited;
      try {
        const data = await exportAllUserData(env.DB, uid, Date.now());
        return json({ success: true, data });
      } catch (err) {
        console.error("account export failed", { error: String(err) });
        return json({ success: false, error: "export_failed" }, 500);
      }
    }

    return json({ success: false, error: "not_found" }, 404);
  },
};
