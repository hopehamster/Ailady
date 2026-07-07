# Next Execution Slice

Date: 2026-07-06

## Title

Post-deploy: Aria depth (M9) — make HER good; billing (M8) is the queued revenue gate

## Where we are (reality, reconciled 2026-07-06)

**The first production deploy SHIPPED and is verified.** Aria is LIVE:
- **Prod:** https://aria-worker.mikebradley1980.workers.dev (single-origin worker serves the SPA + API; worker `1d842f2a`).
- **Staging:** https://aria-worker-staging.mikebradley1980.workers.dev (ENV=staging, Turnstile TEST keys + deterministic mock OTP — a self-drivable clone).
- Full authed loop (sign-in → chat → emote → voice → memory-across-reload) proven end-to-end by the committed `apps/web/tests/authed-loop.spec.ts` (green vs staging) — **no human needed**. Prod real-user token issuance confirmed.
- **#42 CLOSED** (the M0 integration + first deploy). The one remaining item is a shared/observed real-SMS delivery check (co-check via `wrangler tail`, ~30s), not blocking.

**New capability:** `pnpm aria:talk` — talk to Aria server-side, bypassing sign-in (staging mock-OTP HTTP flow → real `/api/chat`). This is the fast loop for working on her personality; it found #43.

## Current focus — M9 SOUL / Aria Depth (owner direction: "work on Aria")

Live testing (`aria:talk`) surfaced 3 real conversation defects → **#43** (P1). The through-line: the base brain + persona layer are her ceiling. Priority order within M9:

1. **E1 earned-weight economy** (the sycophancy fix — #43 defect #2, tied to the SOUL v1.1 HARVEST in `soul-architecture.md`). **First code increment landed 2026-07-07, flag-OFF everywhere**: earned/cheap approval perception, non-nutritive cheap recognition discharge, I9 property tests. Baseline staging `aria:talk` still reproduces #43: over-encourages risky startup quit, backpedals under honesty challenge, and leaks a truncated callback. Next action: flip only in staging/local and measure with `pnpm aria:talk`; do not flip prod until smoke evidence is good. Codex could not deploy staging from this shell because Wrangler is not authenticated.
2. **#39 B1 broadcast→words** — SHIPPED but flag-OFF (`PSYCHE_INNER_STATE_ENABLED=false`). Flip-on live-arc smoke (measure with `aria:talk`).
3. **#43 defects #1 (hallucinated callbacks) + #3 (canned openers)** — root cause is largely the base brain + the DO-NOT-TOUCH `conversationPolicyService.ts`. Best addressed by the **brain swap** (#37 0C bench) — a better brain lifts all three at once. `conversationPolicyService.ts` edits need explicit owner go (safety/policy-critical + possible owner WIP).

**HARD-STOP owner gates in M9:** B2 consensus rewrite (#35 epic) + H3 identity-core content (prime values + genesis anchor). Do NOT start those autonomously.

## Queued after Aria depth

- **M8 #40 Billing** (single-tier paywall) — the revenue gate. Now unblocked (deployed origin exists for Stripe/RevenueCat webhooks). P1.
- **M5 #21 voice UX** (P1) · **M5 #20 avatar** (P1, owner provides hand-built GLBs) · **M1 #17 memory contracts** (P1).
- **M4 #10 tracking sync, #29 dirty-tree** (P2) · **#41 knowledge-ops** (backlog, P2).

## Operating rules
Autonomous: owner at start + end; wall → pivot → return. I am the primary tester — self-drive via Playwright + `aria:talk` + the staging harness; never a blind solo owner test (`browser-product-primary-tester.md` two-person-team contract). Model: Opus for psyche design/safety calls, Sonnet for mechanical execution, Fable-5 for her voice/copy.

## Files allowed to change
Pick one issue, stay inside its stream's paths. Do-not-touch: `conversationPolicyService.ts`, `truthKernelService.ts`, `ARIA_CURRENT_TASK_BOARD.md`, `*adminsdk*`.
