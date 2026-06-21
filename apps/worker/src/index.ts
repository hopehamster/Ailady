import type { ChatRequest, ChatResponse } from "@aria/shared-types";
import {
  generateAIResponse,
  detectCrisis,
  CRISIS_RESOURCES,
  ARIA_CRISIS_REPLY,
} from "@aria/aria-core";

export interface Env {
  ENV: string;
  OPENAI_COMPAT_BASE_URL: string;
  OPENAI_COMPAT_MODEL: string;
  OPENAI_COMPAT_API_KEY: string;
  /** Phase-0 dev gate so /api/chat isn't open. Real auth lands in Phase 3. */
  DEV_SHARED_SECRET?: string;
  /** HeyGen LiveAvatar key (server-side only). Phase 0.5 sandbox de-risk. */
  LIVEAVATAR_API_KEY?: string;
}

// HeyGen LiveAvatar free sandbox avatar (Wayne) — zero credits, ~1-min sessions.
const AVATAR_SANDBOX_WAYNE = "dd73ea75-1218-4ef3-92ce-606d5f7fbc0a";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-dev-secret",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
  });
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
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (url.pathname === "/healthz") return json({ ok: true, env: env.ENV });

    if (url.pathname === "/api/chat" && request.method === "POST") {
      // Phase 0: PRIVATE/LOCAL-ONLY. Dev shared-secret gate (real phone-OTP auth is Phase 3).
      if (env.DEV_SHARED_SECRET && request.headers.get("x-dev-secret") !== env.DEV_SHARED_SECRET) {
        return json({ success: false, error: "forbidden" }, 403);
      }

      let body: ChatRequest;
      try {
        body = (await request.json()) as ChatRequest;
      } catch {
        return json({ success: false, error: "bad_request" }, 400);
      }
      if (!body || typeof body.message !== "string" || body.message.length === 0) {
        return json({ success: false, error: "message_required" }, 400);
      }

      const turnId = crypto.randomUUID();

      // 1) Crisis HARD GATE — runs BEFORE the brain. Pure regex; short-circuits.
      const crisis = detectCrisis(body.message);
      if (crisis.severity !== "none" && crisis.category) {
        const resources = CRISIS_RESOURCES[crisis.category] ?? CRISIS_RESOURCES.severe_distress;
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

      // 2) Real Aria turn via the decoupled brain. Phase-0: userId omitted ->
      //    memory:null + default runtime self-model (no Firestore). History is
      //    empty until persistence lands (Phase 1).
      try {
        bridgeEnv(env);
        const ai = await generateAIResponse(
          body.message,
          [], // conversationHistory (Phase 0: none)
          undefined, // userId -> null-memory path
          undefined, // temporalContextInput
          undefined, // chatMode
          undefined, // datesContextBlock
          undefined, // userEnvCtx
          undefined, // featureSettings
          turnId,
        );
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
        console.error("generateAIResponse failed", { error: String(err) });
        return json({ success: false, error: "brain_error", detail: String(err) }, 500);
      }
    }

    // Phase 0.5 — LiveAvatar LITE sandbox session mint. Keeps X-API-KEY server-side;
    // returns ONLY browser-safe tokens (viewer LiveKit token + room URL + control WS).
    // The agent token + api key never reach the browser.
    if (url.pathname === "/api/avatar/session" && request.method === "POST") {
      if (env.DEV_SHARED_SECRET && request.headers.get("x-dev-secret") !== env.DEV_SHARED_SECRET) {
        return json({ success: false, error: "forbidden" }, 403);
      }
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
        return json({ success: false, error: "avatar_error", detail: String(err) }, 500);
      }
    }

    return json({ success: false, error: "not_found" }, 404);
  },
};
