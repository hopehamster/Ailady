---
type: session
issue: "#5 #11 #13 #18 #19 #20 #22 #24"
created: 2026-07-01
---
# wave3-build

- Goal: Wave 3 BUILD wave (production auth, psyche H2 fix, web shell, avatar body, memory recall) — executed through a ~90-min Anthropic permission-classifier outage by building the psyche/memory/avatar/error slices INLINE (Edit/Write stayed available; Bash/Agent/PowerShell were classifier-gated), then dispatching agents once the classifier recovered.
- Work done (all gates green: typecheck 4/4, aria-core 63/63, web e2e 14/14 CI-mode, CI green on PR #30):
  - **#5 W4-P H2 fix** (`99062cb`, inline): root cause was PERCEPTION not drive math — `detectUserStruggling` matched none of the deflection arc's minimizing phrasings. Added Layer-4 `PSYCHE_DEFLECTION` detector (adversarially tightened). Live-proven via arc re-run (`a97…` agent): deflection care **never-focal → focal @ turn 6** (comforting@0.45), engaged arc still quiet. CLOSED. Residuals → **#31**.
  - **#18 memory recall freshness** (`99062cb`, inline): `scored_messages` +`last_accessed`/`access_count` (migration 0004), `effectiveImportance` (decay from max(created,accessed) + log-bounded boost), `selectRecalledIds` bumped in the atomic per-turn batch; recall-eval harness (precision=1.0 on seed). CLOSED.
  - **#22 psyche-to-body** (`4da749d`, inline): `bodyPlanFor` intensity bands (gesture/transition/gaze), driver executes with capability guards + idle gaze loop + deduped moods; `emotionIntensity` plumbed + `data-aria-intensity` hook. CLOSED.
  - **#20 avatar production** (`4da749d`, inline): `data-aria-avatar-status` hook, loading/error/retry states, `onError` contract, WebGL context-loss recovery, CSP/_headers tightened. Remaining (R2 self-host) → #8.
  - **#24 product error UX** (`4da749d`, inline): `errors/chatErrors.ts` (429 retry-after aware) + `ErrorBoundary`, TTS-failure isolation; specs assert copy + absence of raw status.
  - **#11 root CI** (`aca6737` + fixes): CLOSED — proven green on PR #30 after the CI journey (avatar GLBs via `ci-assets-v1` release download, shared-types branded-time closure, `@visual` tag on GPU-bound mood sweep, `test.slow`+60s render budget under SwiftShader).
  - **#19 production web shell** (`d38c03a`, agent): auth-gated entry (phone/OTP + dev-mock adapter, `otpApiAdapter` snap-in for #13), branded AppShell, prod/dev split (bundle-grep verified), deferred history, mobile, 14/14 e2e. CLOSED.
  - **#13 Cloudflare auth** (`0fc981d`, agent): phone-OTP + ES256 JWT + refresh rotation/reuse-revoke, Bearer identity on all /api/* (volley F8 closed), live rate limits + daily D1 ceilings, CORS allowlist C1-C3, migration 0005. 16 live smoke checks. CLOSED.
- Files changed: see commits `99062cb`, `4da749d`, `0356f16`, `4ef4a8a`, `d38c03a`, `0fc981d` + this writeback.
- Commands + evidence: full gate re-run after #13 — `pnpm -r typecheck` clean, `-r test` aria-core 63/63, web e2e 14/14 (CI mode). CI PR #30 both jobs green. Live: OTP→JWT→refresh→revoke flow, deflection arc focal @ T6.
- Decisions:
  - Built inline during the classifier outage rather than idling — psyche/memory/avatar/error slices are Edit/Write-only work; verification + agents resumed on recovery.
  - CI can't run GPU renders (SwiftShader) — mood sweep is `@visual` (local gate), render smoke CI-scaled. Avatar GLBs ride a private GH release, not git.
  - H2 residuals (restraint/variance/loop/post-focal) split to **#31** rather than hidden behind #5.
- Open items:
  - #13 follow-ups: web client adopts Bearer+Turnstile (shell adapter ready), prod secrets, libphonenumber, auth unit tests + CORS-in-volley → #14.
  - #20 R2 self-host → #8. #24 shell-level integration folded into #19 (closed).
  - Worker dev-server needs a compiling tree for LOCAL full-stack e2e (CI is Vite-only, unaffected).
- Next issue: #3 grader fleet on h2fix transcripts → #6 → #7 psyche GO/NO-GO; #8 avatar supply-chain; #14; #31 psyche residuals.
