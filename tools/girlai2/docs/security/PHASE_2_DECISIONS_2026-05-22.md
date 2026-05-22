# Phase 2 — Decisions + Deferrals

**Date:** 2026-05-22
**Scope:** Cloud Run / LiteLLM / streaming / App Check enforcement

## Shipped this phase

### App Check shadow gate ([appCheckGate.ts](../../functions/src/appCheckGate.ts))
- Gate module reading mode from `app_config/app_check_mode` Firestore doc (cached 5 min)
- Wired into 6 highest-cost callables: `generateResponse`, `processLiveModeInput`, `analyzeImage`, `generateVoiceMessage`, `analyzeGalleryPhoto`, `deleteUserData`
- **Defaults to `shadow` mode** — logs + counts unattested calls but does NOT reject (per Round 8 Q4 decision: gather a week of beta signal before flipping to enforce)
- Failures recorded to `app_check_failures/{YYYYMMDD}` with per-action + per-reason counters
- 4 unit tests covering shadow / enforce / off / attested-call

**To flip to enforced after 1-week beta signal:**
```
firebase firestore:set app_config/app_check_mode '{"mode": "enforce"}'
```
Or via Firebase Console. Takes effect within 5 min via the cached read.

## Deferred (with rationale)

### Streaming SSE → DEFERRED to Phase 3+ (Cloud Run)
- **Why now:** Functions v1 SDK (Aria's current) does not support clean streaming. Functions v2 migration touches every callable. Cloud Run is the natural home for streaming.
- **Why not blocker:** Aria's current TTFT is 4–8s end-to-end — already below the Round 9 10s abandonment threshold. Streaming would improve time-to-first-word (~500ms) but is a UX upgrade, not a survival fix.
- **When to do it:** When HeyGen Avatar V or Realtime API integration arrives in Phase 3 — those need streaming. Bundle the work.

### LiteLLM proxy → DEFERRED, not adopted
- **Why not:** LiteLLM's Node ecosystem is thin — the Python proxy is the canonical install, which means deploying a sidecar (Cloud Run or container). That's Phase 2.4 / Phase 3 infrastructure, not a Phase 2 quick-win.
- **Reality check on the synthesis claim:** Round 9 said "Aria's providerExecutionService is a hand-rolled LiteLLM." That's true at the API-abstraction level. But Aria's hand-rolled version is ~200 LOC and works. LiteLLM would replace it with a sidecar dependency + a network hop. Not worth it pre-beta.
- **Vercel `ai` SDK alternative:** would give clean multi-provider streaming in Node natively, no sidecar. Worth a 4h spike if/when streaming becomes urgent. Tagged Phase 3 deliverable.

### Cloud Run service migration → DEFERRED to Phase 3 if streaming/LiteLLM gets adopted
- **Why:** Migrating user-facing endpoints from Functions to Cloud Run is a big topology change. Worth it ONLY when there's a concrete benefit (streaming, LiteLLM sidecar, GPU avatar inference). None of those are needed for closed-beta launch.
- **Cold-start mitigation:** `minInstances: 1` on the most-called callables (already set on `generateResponse`, `generateVoiceMessage`). That covers 80% of the perceived-latency win Cloud Run would provide.

## Phase 2 close — what's still TODO before closed beta

| Item | Owner | Phase | Effort |
|---|---|---|---|
| Run App Check in shadow for ≥1 week, review `app_check_failures` counters | founder | post-beta-onboard | passive |
| Flip App Check to enforce (one Firestore write) | founder | post-1-week | 1 min |
| Streaming + LiteLLM evaluation | engineering | Phase 3 (bundled with HeyGen) | 1-2 days |

## Why this Phase 2 was smaller than original plan

Original Phase 2 was scoped to deliver Cloud Run + LiteLLM + streaming + App Check — that was ~5 days of infra work for a closed beta that doesn't yet need it. The honest move is to:
1. Ship the security-critical piece (App Check, in safe mode)
2. Defer infra that the closed beta doesn't require to launch
3. Avoid plowing into Cloud Run migration before HeyGen integration (Phase 3) tells us whether the topology change is even needed

This is the "build features over infra polish" feedback applied to phase planning. Phase 3 (HeyGen) is closer to user-visible value than Phase 2's Cloud Run migration would have been.
