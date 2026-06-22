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
} from "@aria/aria-core";
import {
  ensureUser,
  getRecentTurns,
  persistTurn,
  compileIntelligentMemory,
  persistTurnAndMemory,
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
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

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/healthz") return json({ ok: true, env: env.ENV });

    if (url.pathname === "/api/chat" && request.method === "POST") {
      // SECURITY (Phase 0/1): this endpoint derives uid from the x-dev-uid header
      // and defaults to a shared "dev-user" — an IDOR/cross-tenant pattern that is
      // ONLY acceptable for local single-developer dev. Real phone-OTP auth +
      // server-derived uid land in Phase 3. devGate fails closed before any work.
      const blocked = devGate(request, env);
      if (blocked) return blocked;

      let body: ChatRequest;
      try {
        body = (await request.json()) as ChatRequest;
      } catch {
        return json({ success: false, error: "bad_request" }, 400);
      }
      if (!body || typeof body.message !== "string" || body.message.length === 0) {
        return json({ success: false, error: "message_required" }, 400);
      }

      // Accept a client idempotency key so a retried turn reuses the same id:
      // chat_turns + scored_messages are ON CONFLICT idempotent and
      // applyTurnToMemory replay-guards the fat-doc on the same turnId.
      const turnId = request.headers.get("x-turn-id") || crypto.randomUUID();
      const nowMs = Date.now();
      // Phase 1a: per-user conversation memory. Real phone-OTP auth is Phase 3;
      // for dev the client may set x-dev-uid to keep separate conversations.
      const uid = request.headers.get("x-dev-uid") || "dev-user";

      try {
        await ensureUser(env.DB, uid, nowMs);

        // 1) Crisis HARD GATE — runs BEFORE the brain. Pure regex; short-circuits.
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
      const blocked = devGate(request, env);
      if (blocked) return blocked;
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
      const blocked = devGate(request, env);
      if (blocked) return blocked;
      if (!env.CARTESIA_API_KEY) return json({ success: false, error: "tts_not_configured" }, 503);

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

    return json({ success: false, error: "not_found" }, 404);
  },
};
