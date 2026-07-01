# Aria Active Work

Date: 2026-06-27

## Current State

Active implementation repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`, branch `aria-clean-recovery-20260327`.

Codex reconciliation on 2026-06-30 observed the current local branch as `aria-web-build-e2e` and the active execution surface as the root pnpm web/worker workspace (`apps/web`, `apps/worker`, `packages/aria-core`, `packages/shared-types`). Treat `tools/girlai2` as important legacy/mobile context unless a task explicitly targets it.

Project tracking is now installed as a first-class workstream:

- GitHub Project: `Aria Product OS`
- Repo map: `ops/aria/current/project-tracking.md`
- Protocol: `ops/aria/protocols/project-tracking-protocol.md`
- Web-first roadmap: `ops/aria/current/web-roadmap.md`
- Multi-agent execution map: `ops/aria/protocols/web-first-multi-agent-execution.md`

**Web-first audit (2026-07-01):** the pivot is real but not launch-complete. Root typecheck passed, root unit tests passed with aria-core 39/39 green, and web E2E CI timed out after 124 seconds in this shell. GitHub issues #11-#28 now cover CI, auth, psyche fallback, memory durability, web shell, body/voice, release, observability, and multi-agent collision prevention. Issue #9 was promoted to P0 for production auth/rate-limit hardening.

**Pre-session health (2026-06-27):** 4/4 packages typecheck CLEAN. 39/39 tests pass. Worker builds and deploys.

**Two active workstreams** — see dispatch index at `ops/aria/protocols/dispatch-sheets/INDEX.md`:

### Waves Completed
- **Wave 1** (4 agents): Phase A diagnosis confirmed H2+H3. Security tools installed. fast-check added. Shared types extracted.
- **Wave 2** (3 agents): T1 property sweep (8 invariants, 80K runs). T3 body-fidelity (8 moods). Phase 1 breadth scans (0 CVEs, 1 HIGH CORS finding).
- **Audit pass** (2026-06-27): 3 fixes applied from TS knowledge audit (moduleDetection, expect.toPass, branded EpochMs).

### Waves Ready (dispatch sheets written)
- **Wave 3** (3 agents): T2 live arcs, T4 grader fleet, D1 schema
- **Wave 4** (2 agents): Phase C fixes, T5 regression + ablation
- **Wave 5** (planned): GO/NO-GO verdict, body-fidelity deepening, security Phase 2-3

### Workstream A: Psyche Readiness (diagnose → tune → body-fidelity)
The "is the psyche ready for the body?" gate. Phase A (diagnose) confirmed the flat-result root cause: wrong eval arc (engaged instead of deflection) + wrong no-focal-drive fallback affect (neutral instead of warm). Phase B (vast virtual testing engine — 5 tiers from pure-layer property sweeps to continuous regression) is the spine. Phase C fixes the two genuine gaps. Phase D deepens body fidelity.

### Workstream B: Security Volley + Standing Gate
10-phase real-tool penetration test against the full stack (worker, web, auth-spike, LLM brain). Produces a ranked verified report. Builds a standing `pnpm security:gate` for CI + `pnpm security:volley` for nightly/manual. Report-first: no code fixes until findings are approved.

### Completed (committed e7cde7a)
- Aria Talking Loop (chat → emotion → speech pipeline)
- Full Playwright E2E suite (render, emote, audio, loop specs)
- GLB self-hosting for reliable avatar load

## Immediate Next Actions

1. Use `ops/aria/current/project-tracking.md` and GitHub Project `Aria Product OS` as the execution board.
2. Use `ops/aria/current/web-roadmap.md` as the launch roadmap.
3. Close #12 adapter truth cleanup, then #1 CORS adjudication.
4. Install #11 root CI/security gate.
5. Start #13 Cloudflare auth spike integration and #9 worker rate-limit planning.
6. Dispatch/execute Wave 3:
   - W3-P live arcs
   - W3-L grader fleet
   - W3-M D1 schema
7. Dispatch/execute Wave 4 after Wave 3 evidence:
   - W4-P Phase C fixes
   - W4-L T5 regression + ablation
8. Compile Wave 5 GO/NO-GO verdict.
9. Use scoped checkpoint paths only.

## Do Not Lose These Facts

- The clean repo is the only active implementation base.
- The old repo is reference-only and should not receive new product work.
- `llmService.ts` shrink is DONE — current shape is accepted as stable coordinator baseline.
- `HeyGen WebView` remains the planned avatar upgrade direction, but not before psyche + security are solid.
- The PM protocol at `ops/aria/protocols/project-management.md` is now canonical for all work.
- `verification-before-completion` is the iron law — no claims without fresh evidence.
- 2026-04-08 tester-readiness work already landed locally and is deployed:
  - `generateResponse` updated successfully
  - `generateVoiceMessage` updated successfully
  - voice cleanup and fallback-continuity changes are live
  - settings-aware location-awareness truth wiring is live
  - remaining blocker is live tester validation, not deployment
