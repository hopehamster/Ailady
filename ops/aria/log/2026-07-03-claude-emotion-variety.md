---
type: session
issue: "#34"
created: 2026-07-03
---
# 2026-07-03 — claude — emotion-forward state-appropriate variety (#34)

> Wave 4, Psyche stream. Owner-decision-gated fix; clears the last code-level #7 blocker.

## Slice
Issue **#34 (P1)** — the psyche's emotion-forward layer collapsed emotional range to mono-`caring` (ablation #6). Owner decision (2026-07-03): intended range = **state-appropriate variety**.

## Root cause
`arbitrate()` emits the #15 warm baseline (`caring@0.2`) on every no-focal turn; emotion-forward (P4) overrode the model's expressed emotion with it → 86% of turns flattened to caring. Baseline was meant as a floor, acted as an override.

## Fix (minimal, backward-compatible)
- `egoArbiterService.ts` — added optional `EgoDirective.assertEmotion`. No-focal warm-baseline path sets `false` (defer to model); focal drives + deliberate yield set `true` (assert).
- `llmService.ts` — the two emotion-forward sites gate on `assertEmotion !== false`.
- `test/emotion-forward-variety.test.ts` — arbiter contract (baseline=false, focal=true, yield=true).
- (Reverted a rationale-string tweak to keep phase-a-diagnosis.test.ts green — surgical.)

## Verification
- Unit 94/94, security 35/35, typecheck 4/4, no regression.
- **Live re-run** (psyche ON, fixed) vs old h2fix: `caring` share **86%→0%**; distinct client emotions **7→10** (well-distributed: neutral 25%, happy 18%, curious 16%, excited 11%, comforting/loving/sad/playful/thoughtful/concerned); per-arc 2–3 → **5–6** (engaged 2→6).
- **Re-ablation** `ablation-onfixed-2026-07-03.json`: ON-fixed vs OFF still **SIGNIFICANT** (respDiv 1.0) — psyche still shapes responses; only stopped flattening emotion. #6 ablation-2026-07-03.json restored intact (0.971).

## Honest scope note
`psycheTrace.intendedEmotion` still logs the arbiter's baseline intent (`caring`), so run-arcs' trace-based variance assertions remain a proxy. The **expressed** (client/avatar) emotion — the actual #34 concern — is now richly varied. Trace-reflects-expressed is a follow-up telemetry nicety.

## Handoff
#34 closed. All three code-level #7 blockers cleared: **#32 (C1), #34 (C4), #33 (C6)**. The only remaining step to a GO is a **full re-gate** (fresh arcs → drift → re-grade → re-ablate → re-compile). #31 residuals are quality, not gate-blocking. Owner decision saved to memory (`project_aria_emotional_range`).
