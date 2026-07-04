---
type: session
issue: "#39 #35 #17"
created: 2026-07-04
---
# soul-b1-broadcast-to-words — the psyche's want reaches her words (+ soul architecture landed)

- **Goal:** Land the owner-approved SOUL ARCHITECTURE (Fable-mode design) in the repo and ship its first slice, B1 (#39): the arbiter's structured want — move intent + held thread + restraint — injected into generation, flag-gated.

- **Work done:**
  1. **Soul architecture mirrored** to `ops/aria/protocols/soul-architecture.md` (100 lines) — self-as-data-plus-programs; bounded input (user + reconstituted simulated life); emotions as appraisal programs; mood = valence×arousal EMA with a temperament set-point; opinions with dissonance stickiness; salience-gated Global-Workspace consensus (collapse/blend, discrete move + blended coloring); QA-hardened (6 gaps closed). Owner-approved via plan mode; evidence comment on epic #35.
  2. **B1 shipped (#39):** new pure `innerStateNarratorService.renderInnerState(directive, {pursuedTopic})` — 7 move-pulls in Aria's inner voice (🎭 Fable-authored), held-thread line, restraint narration; wrapped `[Inner state: … Never say any of this — live it.]`. Contract: null/yield → ''; **baseline-defer (#34 guard)** → no move direction (at most the held thread); never names the feeling. Injected via `responseAssemblyService` (`innerStateBlock`, before the tone hint; empty→filtered→byte-identical) and threaded in `llmService` behind function-time `psycheInnerStateEnabled()` with the pursued-loop→topic lookup (the held thread finally lands as language, not telemetry). Worker `Env` + `bridgeEnv` + `.dev.vars` wired (default OFF everywhere).
  3. **#17 slice committed** (`3cafc9e`): `parseArray` D1 hydration guard — malformed JSON columns can no longer cast through `?? []` into a downstream `.map` crash.
  4. **Claims:** #39 registered (single-lead), #36 parked (psyche epic deferred P2).

- **Files changed:** `packages/aria-core/src/services/{innerStateNarratorService.ts(new),responseAssemblyService.ts,llmService.ts}`, `packages/aria-core/test/inner-state-block.test.ts` (new, 8 tests), `apps/worker/src/index.ts`, `apps/worker/.dev.vars` (gitignored), `ops/aria/protocols/soul-architecture.md` (new), `ops/aria/current/claims.json`, `apps/worker/src/memory.ts` (in `3cafc9e`).

- **Commands + evidence:** aria-core typecheck clean · **test 102/102** (incl. 8 new B1: narrator contract, baseline-defer, never-names-feeling, distinct pulls, assembly byte-identity absent, verbatim injection present) · **test:security 35/35** · root typecheck 4/4 workspaces.

- **Decisions:** narrator = new focused pure service (arbitration untouched → I7 safe); restraint narration uses the existing `directive.restraint` flag (the applyEgoBias was-clamped refinement deferred — simplicity-first); B1 lands flag-OFF (byte-identical proven).

- **Open items:** #39 live-arc smoke with the flag ON (the last acceptance box — run at the next arc session or flag-flip); then B-track continues per the architecture (appraisal emotions → consensus heart [owner gate] → …) after Track-A core; Track A next = #8 self-host engine + CSP.

- **Next issue:** #8 (avatar supply-chain hardening) per the core-first queue; #39 flag-ON smoke opportunistically.
