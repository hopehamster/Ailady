---
type: session
issue: "#27"
created: 2026-07-04
---
# 27-observability — reqIds + privacy-safe error taxonomy + beta monitoring plan + incident template

- **Goal:** Minimum beta observability + incident response for an intimate companion — zero conversation content in any log (#27).

- **Work done:**
  1. **Worker (code):** per-request `reqId` minted at the single fetch seam (same philosophy as the CORS seam), threaded to `routeRequest`, echoed on EVERY response as `x-request-id` — a user report + timestamp now correlates to exact log lines. New `errCategory()`/`errLog()`: privacy-safe categories (timeout/network/db/auth/rate-limit/provider/internal) + a 200-char-bounded infra message; all 7 error-log sites converted (chat, avatar, tts×2, delete, export, semantic-index).
  2. **`docs/observability/OBSERVABILITY.md`:** the privacy boundary FIRST (never message text/prompts/memory content/phone numbers); signal table (uptime/latency/provider-failures/LLM-spend/error-rate/security-events) → existing sources (`turn.spend`, errLog cats, canary/ban logs, Workers Analytics) → beta alert thresholds; beta-lean tooling (wrangler tail, Workers Logs toggle, external healthz pinger); langfuse deliberately NOT enabled pending its own privacy review; 5-minute weekly review ritual.
  3. **`ops/aria/protocols/incident-template.md`:** SEV levels, timeline, mitigation (links the #26 rollback), root cause, a MANDATORY privacy check section, follow-ups→issues, writeback.

- **Files changed:** `apps/worker/src/index.ts`, `docs/observability/OBSERVABILITY.md` (new), `ops/aria/protocols/incident-template.md` (new).

- **Commands + evidence:** worker typecheck clean · web e2e **17/17** (worker serves the suite's healthz — unaffected).

- **Decisions:** no new infra for beta (Cloudflare-native + free pinger); reqId at the seam (one signature change) over per-route generation; provider-failure category added at the cartesia site.

- **Next issue:** #23 browser lifecycle suite.
