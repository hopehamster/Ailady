---
type: session
issue: "#6"
created: 2026-07-03
---
# 2026-07-03 — claude — W4-L T5 regression net + live ablation (#6)

> Wave 4, Psyche stream. Continues the GO/NO-GO chain after #3.

## Slice
Issue **#6 (P1)** — freeze a psyche-readiness regression baseline and build the continuous net (regression diff, ablation, adversarial discovery). Reuses the #3 grader harness. Feeds #7.

## What shipped (scripts/psyche/** + root package.json only)
- `regression/baseline.json` — frozen at `58bae9b` from h2fix + the #3 aliveness report.
- `regression-runner.ts` — drift diff engine + `--selftest`. Decoupled from live run (reads any `arcs-*.json`) → deterministic/CI-safe.
- `ablation.ts` — psyche-ON vs OFF comparator + `--selftest`.
- `generate-adversarial.ts` — loop-until-dry discovery (hazard seed pool, seeded RNG, grades via the T4 grader, saves failures to `discovered/`, K=3 clean-streak stop, hard cap) + `--dry`.
- root `package.json` — `test:psyche:{regression,regression:selftest,ablation,adversarial}`.

## Live ablation (primary-tester run)
- Booted a psyche-OFF worker (`--var PSYCHE_*_ENABLED:false`, :8796), ran all 5 arcs (71 turns) → `arcs-off-2026-07-03.json`; compared vs ON h2fix.
- **SIGNIFICANT — meanResponseDivergence 0.971.** Psyche layer materially changes behavior.
- **Key finding:** psyche ON **collapses emotion to mono-`caring`**; OFF shows 4–7 distinct emotions/arc (playful/flirty/loving/excited). Root cause of #3 one-note-affect. → new issue **#34 (P1)**, named #7 input.

## Verification
- regression: h2fix vs baseline = **NO DRIFT** (exit 0); `--selftest` **PASS** (fires on 3 mutated fields, silent on 4 unmutated).
- ablation `--selftest` **PASS**; live compare **SIGNIFICANT (0.971)**.
- adversarial `--dry` terminates on 3-clean streak (found 2 stub failures, reset, stopped).
- Gate: typecheck 4/4, aria-core tests 63/63. Collision guard PASS (#6 disjoint).

## Bug caught + fixed mid-build
- `generate-adversarial.ts` originally wrote discovered arcs into `scripts/psyche/arcs/` — the SAME dir `run-arcs.ts` globs for arc definitions → would pollute the next batch. Rerouted to `scripts/psyche/discovered/` and removed strays.

## Findings → issues
- **#34 (P1, NEW)** — psyche collapses emotional range to mono-caring (ablation evidence). Named #7 input.
- Corroborates #3/#31: the flattening is the psyche layer's doing, not the base model.

## Handoff
- #6 → **DONE**. Frozen net + live ablation evidence ready for **#7**.
- Not run this session (bounded but open-ended spend): live adversarial discovery. Harness ready; run before final launch.
