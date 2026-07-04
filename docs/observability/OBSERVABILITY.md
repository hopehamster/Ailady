# Aria Beta Observability (#27)

> Minimum monitoring for an **intimate companion**: know she's up, fast, safe, and
> affordable — while logging **zero conversation content**. Incidents: use the
> template at `ops/aria/protocols/incident-template.md`.

## Privacy boundary (the non-negotiable, first)
Aria's conversations are intimate data. The observability layer NEVER records:
- message text, prompts, replies, TTS text, or memory content (facts/moments/loops);
- phone numbers (auth logs use `phone_hash` only);
- anything that reconstructs a conversation.

What IS logged: request ids, uids (opaque), models, routes, timings, token/cost
estimates, **bounded** infra error strings (`errLog` caps at 200 chars, category-
tagged), psyche trace metadata (drives/moves — state labels, not content), and
security event names. `docs/security/` governs retention; export/delete paths
(GDPR) already cover the underlying data.

## Signals → where they come from → alert thresholds (beta)

| Signal | Source (exists today) | Beta alert |
|---|---|---|
| **Uptime** | `GET /healthz` — external pinger (e.g. UptimeRobot free, 1-min) | 2 consecutive fails → notify |
| **Latency** | `turn.spend.genMs` (per-turn log) + Workers Analytics p50/p95 | p95 > 8s over 15 min |
| **Provider failures** | `chat turn failed` / `cartesia tts failed` logs (`cat: provider/network/timeout`) + fallback-chain logs | >5% of turns in 15 min |
| **LLM spend** | `turn.spend.estCostUsd` (lower-bound estimate) | daily sum > $10 (beta) |
| **Error rate** | `errLog` lines by `cat` (Workers Logs / Logpush query) | any cat >2% of requests |
| **Security events** | `security.canary_tripped`, `ban.tampering`, `chat.daily_ceiling`, rate-limit 429s | canary/ban: notify on EACH |

## How to look (beta-lean, no new infra)
- **Live tail:** `wrangler tail -c apps/worker/wrangler.production.toml --format pretty`
  (filter: `--search errLog`/`security.` etc.).
- **Dashboards:** Cloudflare → Workers & Pages → aria-worker → Analytics (requests,
  errors, p50/p95 CPU+duration) — free, zero setup.
- **Retention/queries:** enable **Workers Logs** on the prod worker (dash toggle) for
  searchable history; Logpush → R2 later if beta outgrows it.
- **Correlation:** every response carries `x-request-id`; every error log carries the
  same `reqId` + a privacy-safe `cat`. A user report + timestamp → exact log lines.
- **`langfuse.ts`** (aria-core) exists for LLM-trace depth; NOT enabled for beta
  (content-adjacent tracing needs its own privacy review first — deliberate).

## Weekly beta review (5 minutes)
Spend total · error rate by cat · p95 latency · security-event count · top reqIds
investigated. Paste into the week's ops log entry.
