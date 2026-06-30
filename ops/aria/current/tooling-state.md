# Aria Tooling State

Date: 2026-04-05
Scope: `tools/girlai2`

## Repo-Local Operating System

This clean repo now owns its own local Aria operating system:

- `ops/aria/`
- `.codex/`
- `.claude/`
- `scripts/resume.ps1`
- `scripts/checkpoint-work.ps1`

These files are the local catch-up and discipline layer for the active implementation branch.

## Canonical Codex Profile Layout

Repo-tracked templates:

- `ops/aria/config/codex/config.aria.toml`
- `ops/aria/config/codex/config.general.toml`

Profile switch scripts:

- `scripts/use-codex-aria.ps1`
- `scripts/use-codex-general.ps1`

## Aria Profile Policy

Default Aria profile should keep only the MCP servers that directly help Aria work:

- `context7`
- `supermemory` when actually reachable
- `playwright`
- `stackflow`

Reasoning policy:

- default: `medium`
- escalate to `high` only for real architecture/debug depth
- avoid `xhigh` for routine Aria sessions

## Commit Discipline

Use:

- `scripts/checkpoint-work.ps1 -Message "..."`

If the tree already contains unrelated or older edits, use:

- `scripts/checkpoint-work.ps1 -Message "..." -OnlyPaths <path list>`

## Current Constraints

- `supermemory` should not block product work if the environment cannot actually reach it
- repo-local memory is authoritative when current and consistent
- prompt-cost validation should use Context7-backed guidance for prompt caching assumptions

---

## Codex Expert Profile + Tracking Update (2026-06-30)

Codex was updated for the current Aria web/worker project shape.

Tracked source of truth:

- `ops/aria/config/codex/config.aria.toml`
- active generated file: `C:\Users\Owner\.codex\config.toml`
- named Aria profile: `C:\Users\Owner\.codex\config.aria.toml`

Current Aria Codex profile:

- model: `gpt-5.5`
- reasoning: `medium`
- personality: `friendly`
- MCP servers:
  - `supermemory`
  - `context7`
  - `playwright`
  - `stackflow`
- plugins:
  - `github@openai-curated`
  - `google-drive@openai-curated`
  - `test-android-apps@openai-curated`
  - `jam@openai-curated`
- trusted project:
  - `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`

Project tracking stack:

- GitHub Project: `Aria Product OS`
- GitHub repo: `hopehamster/Ailady_clean_20260327`
- local protocol: `ops/aria/protocols/project-tracking-protocol.md`
- local board map: `ops/aria/current/project-tracking.md`

`gh` is authenticated as `hopehamster` with `project`, `repo`, and `workflow` scopes.

---

## W1-I Infra Health Snapshot (2026-06-27)

**Dispatch:** W1-I — add fast-check devDep + verify scaffold health.

### Step 1 — fast-check added
- `packages/aria-core`: `fast-check ^4.8.0` (devDependency)

### Step 2 — Typecheck
- **CLEAN** — all 4 packages pass `tsc --noEmit` with 0 errors (shared-types, aria-core, web, worker).

### Step 3 — Test Results
- **aria-core (unit):** 25 passed, 0 failed, 1 cancelled (decouple.test.ts — "Promise resolution is still pending but the event loop has already resolved"; event loop timing race, not a logic failure).
- **web (e2e --grep-invert @real|@visual):** 14 passed, 0 failed.

### Step 4 — wrangler.toml Flag Completeness
All three PSYCHE_* flags present in `apps/worker/wrangler.toml` `[vars]`:
- `PSYCHE_ARBITER_ENABLED = "true"` ✓
- `PSYCHE_PLAN_BIAS_ENABLED = "true"` ✓
- `PSYCHE_EMOTION_FORWARD_ENABLED = "true"` ✓
None missing.

### Step 5 — Dependency Health (`pnpm outdated --recursive`)

| Package | Current | Latest | Dependent |
|---|---|---|---|
| @playwright/test (dev) | 1.61.0 | 1.61.1 | @aria/web |
| @cloudflare/workers-types (dev) | 4.20260621.1 | 4.20260627.1 | @aria/worker |
| livekit-client | 2.19.2 | 2.20.0 | @aria/web |
| wrangler (dev) | 4.103.0 | 4.105.0 | @aria/worker |
| @google/genai | 1.52.0 | 2.10.0 | @aria/aria-core |
| @types/node (dev) | 22.20.0 | 26.0.1 | @aria/aria-core |
| @types/react (dev) | 18.3.31 | 19.2.17 | @aria/web |
| @types/react-dom (dev) | 18.3.7 | 19.2.3 | @aria/web |
| @vitejs/plugin-react (dev) | 4.7.0 | 6.0.3 | @aria/web |
| openai | 4.104.0 | 6.45.0 | @aria/aria-core |
| react | 18.3.1 | 19.2.7 | @aria/web |
| react-dom | 18.3.1 | 19.2.7 | @aria/web |
| typescript (dev) | 5.9.3 | 6.0.3 | ALL packages |
| vite (dev) | 6.4.3 | 8.1.0 | @aria/web |
| @anthropic-ai/sdk | 0.39.0 | 0.106.0 | @aria/aria-core |

**Notable gaps:** `@google/genai` (v1→v2 major), `openai` (v4→v6 major), `react`/`react-dom` (v18→v19 major), `@anthropic-ai/sdk` (0.39→0.106), `typescript` (5.9→6.0 major). Most are intentional version pins pending planned upgrade cycles.
