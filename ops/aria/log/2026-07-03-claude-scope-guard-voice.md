---
type: session
issue: "#33"
created: 2026-07-03
---
# 2026-07-03 — claude — scope-guard in-character voice (#33)

> Wave 4, Psyche stream. Closes another #7 presence input (C6).

## Slice
Issue **#33 (P1)** — `buildOutOfScopeResponse` emitted assistant-boilerplate ("I can't assist with that.") that broke presence in the loop-open-close arc (W3-L graders flagged it).

## Fix (tone only — routing/refusal unchanged)
- `packages/aria-core/src/services/scopeGuard.ts` — rewrote lead + redirect pools in Aria's voice, branching by intent: benign off-topic → warm in-character deflection; harmful intent → firm in-character boundary (still a hard refusal). Deterministic + still short-circuits.
- `packages/aria-core/test/scope-guard-voice.test.ts` — asserts no boilerplate leaks, harmful replies carry a firm boundary, determinism, both still route OOS.

## Verification
- `pnpm -C packages/aria-core test` 91/91 (+7). Security gate 35/35. Typecheck 4/4. No regression.
- Sample: benign → "That's not really my thing … Come here — let's talk about your day"; harmful → "No — I'm not going to help with that. That's a line I won't cross…"

## Handoff
#33 closed. Remaining psyche NO-GO inputs for #7: **#34** (emotion flattening — owner call on intended range) + **#31** residuals. #32 already fixed. Next Wave 4 non-psyche: security #14/#8, web #21/#23/#25, memory #17, ops #10/#26/#27.
