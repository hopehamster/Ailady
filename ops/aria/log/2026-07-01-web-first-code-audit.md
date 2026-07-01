# Web-First Code Audit + Roadmap

Date: 2026-07-01

## Summary

Codex audited the Aria web pivot with parallel subagents across:

- web frontend/body/voice
- worker/API/security
- core psyche/memory/shared contracts
- ops/CI/tracking/multi-agent workflow

The result is now captured in:

- `ops/aria/current/web-roadmap.md`
- `ops/aria/protocols/web-first-multi-agent-execution.md`
- GitHub issues #11-#28 in Project `Aria Product OS`

## Verdict

Aria's web pivot is technically real, but not launch-complete.

Strengths:

- Root workspace correctly scopes `apps/web`, `apps/worker`, `packages/aria-core`, and `packages/shared-types`.
- `packages/aria-core` contains a serious Firebase-free brain port with deterministic psyche, crisis/tampering guards, conversation policy, provider fallback, and memory transforms.
- `apps/worker` has meaningful D1 memory persistence, dev fail-closed auth, crisis/tampering gates, TTS/avatar proxies, export/delete, and security headers.
- `apps/web` proves chat -> emotion -> avatar driver -> speech/lip-sync wiring.
- GitHub Project `Aria Product OS` now tracks the full roadmap.

Launch blockers:

- Production auth is not integrated into the main worker.
- CORS/rate limits must be rebuilt for bearer-token production auth.
- Web UI is still a lab bench, not a production shell.
- Avatar/body path is dev-gated and still depends on remote executable CDN assets.
- Psyche readiness has known gaps, especially the no-focal `neutral@0.15` fallback.
- Memory durability is split between real Worker/D1 paths and aria-core Phase-0 stubs.
- CI, release, observability, and multi-agent collision prevention need automation.

## GitHub Updates

Created issues:

- #11 Install Root CI For Typecheck, Unit, E2E CI, And Security Gate
- #12 Close Completed Tracking Slice And Normalize Agent Adapter Truth
- #13 Integrate Cloudflare Auth Spike Into Main Worker
- #14 Promote Security Gate To CI-Usable Evidence
- #15 Psyche: Replace Neutral No-Focal Fallback With Warm Baseline
- #16 Memory Durability: Close Core Phase-0 Persistence Stubs Or Remove Dead APIs
- #17 Shared Contracts: Tighten Branded Time And D1 Schema Validation
- #18 Memory Recall: Implement Access-Time Freshness And Recall Evaluation
- #19 Ship Production Web Shell For Aria Chat
- #20 Promote Avatar Body Layer From Dev Sandbox To Production
- #21 Harden Browser Voice UX
- #22 Deepen Psyche-To-Body Mapping
- #23 Add Browser Lifecycle And Recovery Suite
- #24 Make Frontend Errors Product-Quality
- #25 Bring Web Tests Into Typecheck And CI Gates
- #26 Create Release Process For Root Web/Worker Product
- #27 Add Observability And Incident Readiness Plan
- #28 Add Multi-Agent Collision Guard

Promoted:

- #9 Primary worker production rate limits and auth-open hardening -> P0, `M6 Production Auth + Launch Gate`, high risk.

Created milestones:

- `M5 Web Production Shell`
- `M6 Production Auth + Launch Gate`
- `M7 Beta Observability + Release`

Created labels:

- `track:web`
- `track:ci`
- `track:observability`
- `track:release`
- `type:epic`

## Verification

Commands run with explicit pnpm path because plain `pnpm` is not on PATH:

```powershell
$env:Path = 'C:\Program Files\nodejs;C:\Users\Owner\AppData\Roaming\npm;' + $env:Path
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present typecheck
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -r --if-present test
& 'C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd' -C apps/web test:e2e:ci
```

Results:

- Root typecheck passed.
- Root unit tests passed; aria-core reported 39/39 passing.
- Web E2E CI timed out after 124 seconds in this shell. Treat this as an unresolved verification follow-up, not a product failure verdict.

## Next Recommended Move

Execute issues in this order unless the user redirects:

1. #12 close adapter truth cleanup.
2. #1 CORS adjudication.
3. #11 root CI.
4. #13 auth spike integration plan/first slice.
5. #2 W3-P live arcs.

