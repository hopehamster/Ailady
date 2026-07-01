# Aria Web-First Roadmap

Date: 2026-07-01

## North Star

Ship Aria as a web-first intimate companion with a credible brain, durable memory, secure Cloudflare runtime, expressive browser body/voice layer, and an operating system that lets one human use multiple AI agents without quality collapse.

## Current Audit Verdict

The web pivot is real and technically promising, but not yet launch-shaped.

What is strong:

- Root pnpm workspace cleanly scopes the web product: `apps/web`, `apps/worker`, `packages/aria-core`, `packages/shared-types`.
- `packages/aria-core` contains a serious Firebase-free brain port with deterministic psyche, crisis/tampering guards, conversation policy, provider fallback, and memory transforms.
- `apps/worker` owns D1 persistence, crisis/tampering gates, dev fail-closed auth, TTS proxy, avatar session proxy, export/delete, and security headers.
- `apps/web` proves the talking loop: chat response -> emotion -> avatar driver -> speech/lip-sync seam.
- Existing tests are meaningful: root typecheck passes; aria-core unit/security/property tests pass; Playwright coverage exists for mocked loop, render/audio/resilience/security paths.
- GitHub Project `Aria Product OS` now tracks execution.

What is not launch-ready:

- Production auth is not integrated into the main worker; identity is still dev-header based behind `devGate`.
- Main-worker CORS/rate-limit posture must be rebuilt for bearer-token production auth.
- The web app is still a lab bench, not a production product shell.
- The primary 3D body is dev-gated and still depends on remote executable CDN assets.
- Psyche readiness has known gaps: no-focal fallback is still flat `neutral@0.15`; multi-arc live evaluation and independent grader fleet are not complete.
- Memory durability is partly real in Worker/D1, but aria-core still exposes Phase-0 stub paths for several persistence surfaces.
- CI is not installed as `.github/workflows`; local gates are good but not enforced.
- Release, observability, and incident response are not first-class yet.

## Launch Phases

### Phase 0 — Stabilize The Operating System

Goal: make every future session start from the same truth and prove the local gates are runnable.

Required outcomes:

- Active slice points to CORS adjudication + Wave 3, not completed tracker installation.
- GitHub Project, repo docs, Obsidian, `.codex`, and `.claude` agree on the web-first product.
- Root CI exists for typecheck, unit tests, mocked Playwright, and deterministic security checks.
- Agent workflow includes collision prevention and explicit write ownership.

Primary issues:

- #10 Tracking upkeep
- Install Root CI For Typecheck, Unit, E2E CI, And Security Gate
- Close Completed Tracking Slice And Normalize Agent Adapter Truth
- Add Multi-Agent Collision Guard

### Phase 1 — Close Security/Auth Gate

Goal: make the worker safe to open beyond local dev.

Required outcomes:

- CORS is adjudicated and production-origin aware.
- Main worker uses verified auth identity, not `x-dev-uid`.
- Main worker has per-uid/IP rate limits and spend/concurrency controls.
- Security gate semantics are CI-safe and cannot silently skip protected coverage.
- Deployment configs cannot publish `ENV=dev` or placeholder D1 bindings.

Primary issues:

- #1 CORS adjudication
- #9 Primary worker production rate limits and auth-open hardening
- Integrate Cloudflare Auth Spike Into Main Worker
- Promote Security Gate To CI-Usable Evidence
- Create Release Process For Root Web/Worker Product

### Phase 2 — Prove Psyche Readiness

Goal: decide whether the brain is ready to drive a body.

Required outcomes:

- W3 live arcs produce spend-capped transcripts through `/api/chat`.
- W3 grader fleet independently evaluates aliveness/adherence.
- No-focal fallback becomes warm/non-flat without creating neediness.
- W4 regression/ablation loop catches psyche drift.
- Wave 5 issues a clear GO/NO-GO verdict with evidence.

Primary issues:

- #2 W3-P live arcs
- #3 W3-L grader fleet
- #5 W4-P Phase C fixes
- #6 W4-L T5 regression/ablation
- #7 W5-L GO/NO-GO verdict
- Psyche: Replace Neutral No-Focal Fallback With Warm Baseline

### Phase 3 — Make Memory Durable And Trustworthy

Goal: make Aria remember in ways that are consistent, inspectable, private, and recoverable.

Required outcomes:

- W3-M D1 schema truth is reconciled with the already-present Worker implementation.
- Phase-0 persistence stubs are either made real, renamed unsupported, or removed from the public core API.
- D1 JSON hydration validates schema, not just shape-casts.
- Semantic recall has freshness/access-time behavior and seeded recall evaluation.
- Privacy export/delete policy covers D1, Qdrant, future R2, and audit retention.

Primary issues:

- #4 W3-M D1 schema
- Memory Durability: Close Core Phase-0 Persistence Stubs Or Remove Dead APIs
- Shared Contracts: Tighten Branded Time And D1 Schema Validation
- Memory Recall: Implement Access-Time Freshness And Recall Evaluation
- #9/#Privacy follow-up for export/delete completion

### Phase 4 — Ship The Web Product Shell

Goal: move from lab bench to a product a real user can live inside.

Required outcomes:

- Authenticated web app shell replaces dev-only controls.
- Chat history, settings, onboarding, account/privacy, and empty/loading/error states exist.
- Frontend errors are friendly and retryable.
- Responsive mobile/desktop layout is product-grade.
- Tests cover production navigation and degraded states.

Primary issues:

- Ship Production Web Shell For Aria Chat
- Make Frontend Errors Product-Quality
- Bring Web Tests Into Typecheck And CI Gates

### Phase 5 — Ship Body And Voice

Goal: make Aria visibly and audibly present without outrunning psyche/security evidence.

Required outcomes:

- Avatar assets are self-hosted with strict CSP.
- Production web renders the chosen body instead of dev-only avatar.
- Voice UX has enable/mute/replay/recovery states.
- Psyche-to-body mapping covers emotion, intensity, gaze/idle/gesture, and safe fallback.
- Browser lifecycle suite covers tab restore, repeated mount/unmount, avatar load failure, mobile viewport, and WebGL/canvas nonblank behavior.

Primary issues:

- #8 Avatar supply-chain hardening
- Promote Avatar Body Layer From Dev Sandbox To Production
- Harden Browser Voice UX
- Deepen Psyche-To-Body Mapping
- Add Browser Lifecycle And Recovery Suite

### Phase 6 — Beta Readiness

Goal: make the solo-dev launch loop safe, observable, and recoverable.

Required outcomes:

- Staging/prod deployment checklist is executable.
- Worker/web observability covers errors, latency, provider failures, cost/spend, uptime, and security events.
- Incident template exists and protects intimate user data.
- GitHub issues carry verification evidence before Done.
- Manual/nightly security volley is documented for prelaunch and major changes.

Primary issues:

- Create Release Process For Root Web/Worker Product
- Add Observability And Incident Readiness Plan
- Harden Security Gate Semantics For CI
- #10 Tracking upkeep

## Multi-Agent Execution Pattern

Use one lead agent plus bounded workers:

- Lead: owns tracker, issue ordering, merge/checkpoint, final verification, memory writeback.
- Security/Platform worker: `apps/worker`, `spikes/cloudflare-auth-spike-A`, `scripts/security`, `docs/security`.
- Psyche worker: `packages/aria-core/src/services/psyche*`, `egoArbiterService`, psyche tests, eval scripts.
- Memory worker: `apps/worker/src/memory.ts`, `apps/worker/migrations`, `packages/aria-core/src/services/memoryService.ts`, `packages/shared-types/src/intelligentMemory.ts`.
- Web worker: `apps/web/src`, `apps/web/tests`, `apps/web/public`.
- Ops worker: `.github`, `ops/aria`, `.codex`, `.claude`, release/observability docs.

Rules:

- Do not run parallel workers on overlapping write paths.
- Every worker returns changed files, verification, risks, and GitHub issue evidence.
- Lead runs the integration gate after merging worker outputs.
- Checkpoint with scoped paths only.

## Verification Baseline

Use the global pnpm binary in this environment if plain `pnpm` is missing:

```powershell
$env:Path = 'C:\Program Files\nodejs;C:\Users\Owner\AppData\Roaming\npm;' + $env:Path
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present typecheck
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present test
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -C apps/web test:e2e:ci
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' security:gate
```

Latest audit evidence:

- `pnpm -r --if-present typecheck`: passed on 2026-07-01.
- `pnpm -r --if-present test`: passed on 2026-07-01; aria-core reported 39/39 passing.
- `pnpm -C apps/web test:e2e:ci`: timed out in this shell after 124 seconds; needs a dedicated follow-up run.

