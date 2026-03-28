# Aria Current Task Board

Date: 2026-03-25
Scope: `tools/girlai2`
Phase: responsiveness + feature completeness + test readiness

## Purpose

This is the active work board for the current Aria phase.

It converts the sub-agent operating model into:

- exact packages
- exact deliverables
- exact blockers
- exact completion criteria
- exact order of execution

This document is intended to be the current source of truth for what we do next before the animation upgrade phase.

## Current Priority Order

1. Restore and verify visible feature stability
2. Improve responsiveness and perceived speed
3. Prepare Aria for structured testing
4. Only then move to the fuller animation upgrade

## Hard Blocking Rule

Do not treat Aria as ready for serious testing if any of these remain broken:

- relationship screen crash
- message replay on return/resume
- Live Mode launch or return instability
- Date Mode state restore failures
- visible mismatch between Aria’s claimed features and actual features

## Package A: Latency Baseline and Fast Wins

Owner:

- Latency Agent

Goal:

- Get Aria’s response behavior faster without lowering reliability or feature truthfulness.

### Deliverables

1. A latency baseline snapshot document
2. Stage-timing visibility for:
   - `generateResponse`
   - `generateVoiceMessage`
3. A ranked list of top latency contributors
4. First-wave latency fixes applied
5. Post-fix benchmark comparison

### Files In Scope

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/voiceService.ts`
- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/docs/` latency benchmark notes

### Exact Tasks

1. Confirm current timing fields and fill gaps.
2. Measure:
   - text generation time
   - voice generation time
   - time to playable URL
   - time to actual playback start
3. Identify redundant work per turn:
   - repeated Firestore reads
   - repeated memory assembly
   - unnecessary post-processing
   - over-eager quality passes
4. Apply first-wave reductions:
   - skip non-critical enrichers on simple turns
   - tighten escalation rules
   - reduce redundant data fetches
   - improve voice startup path
5. Re-measure and compare to baseline.

### Blockers

- Major visible feature crashes can invalidate latency testing.
- Broken resume behavior can distort perceived latency measurements.

### Exit Criteria

- We have a written baseline.
- We have a written before/after comparison.
- Median response time is improved measurably.
- No major regression in message quality or voice reliability is introduced.

## Package B: Feature Readiness Sweep

Owner:

- Feature Reliability Agent

Goal:

- Make Aria’s visible feature set stable enough for real testing.

### Deliverables

1. A pass/fail checklist for core visible features
2. Fixes for current critical visible regressions
3. Device verification notes
4. A clear “ready for tester pass” status

### Files In Scope

- `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
- `tools/girlai2/lib/features/chat/widgets/*.dart`
- `tools/girlai2/lib/features/camera/screens/camera_vision_screen.dart`
- `tools/girlai2/lib/features/camera/services/*.dart`
- `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
- `tools/girlai2/lib/core/services/firebase_service.dart`
- feature-facing callable entrypoints in `tools/girlai2/functions/src/index.ts`
- QA scripts and readiness docs

### Exact Tasks

1. Verify and fix relationship screen crash.
2. Verify replay-on-return fix remains stable.
3. Verify Live Mode:
   - launches
   - returns cleanly
   - does not destabilize chat
4. Verify Date Mode:
   - starts
   - persists
   - restores on app resume
   - ends correctly
5. Verify floating reaction symbols appear when expected.
6. Verify chat top-bar flows:
   - settings
   - live mode
   - transcript toggle
   - voice-only toggle
7. Produce a feature readiness matrix.

### Current Known Blockers

1. Relationship screen crash:
   - `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
2. Recent history of replaying last assistant message on return/resume:
   - `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
3. Recent Date Mode restoration gap:
   - `tools/girlai2/lib/features/chat/widgets/virtual_date_chip.dart`

### Exit Criteria

- No critical visible feature crashes remain in the core chat surface.
- Live Mode and Date Mode both work through a real usage loop.
- Replay-on-return bug stays fixed.
- Feature checklist exists and is current.

## Package C: Personality Test-Readiness Support

Owner:

- Personality Agent

Goal:

- Make Aria ready for meaningful user-style testing, not just technical validation.

### Deliverables

1. A test prompt pack for capability, memory, pacing, and repair checks
2. A verified capability/self-awareness behavior list
3. A blocker list of any remaining personality mismatches
4. A “tester instructions” mini-guide for probing Aria

### Files In Scope

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/goldenEvalService.ts`
- supporting docs under `tools/girlai2/docs/`

### Exact Tasks

1. Verify Aria can explain her features truthfully in plain language.
2. Verify she does not claim missing abilities.
3. Verify capability responses match actual visible feature state.
4. Build test prompts for:
   - feature explanations
   - follow-up memory
   - chronology awareness
   - gentle repair after misunderstanding
   - low-pressure engagement
5. Flag any behavior that would mislead testers about product capability.

### Blockers

- Feature readiness issues can make self-awareness answers incorrect in practice.
- Latency problems can distort personality evaluation if response timing is too poor.

### Current Package C Findings

- Capability self-description is usable.
- Chronology truthfulness is now usable after the recent-turn chronology router tightening.
- Remaining blockers for Package C sign-off:
  - feature-limit question routing (`what can you not do yet`)
  - recent-exchange memory continuity
  - concise repair behavior
  - low-pressure handling for short replies

### Exit Criteria

- Aria’s self-description matches current product truth.
- A tester can intentionally probe capabilities and get coherent, accurate answers.
- Prompt pack exists and is ready to use.

## Blocking Order

This order is mandatory for the current phase.

### Stage 1

Resolve Package B critical blockers first:

- relationship screen crash
- replay-on-return stability
- Live Mode / Date Mode visible readiness

Reason:

- Broken visible features invalidate both latency and personality testing.

### Stage 2

Run Package A latency work next.

Reason:

- Once visible flows are stable, latency numbers become meaningful and comparable.

### Stage 3

Run Package C personality test-readiness pass.

Reason:

- Aria’s self-awareness and tester prompt pack should reflect the actual stable feature set.

## Current Go / No-Go Gates

### No-Go For Broad Testing

Any of the following means Aria is not ready for a broader tester pass:

- visible crash in relationship, chat, or live-mode surface
- replay-on-return bug still occurs
- Date Mode does not restore correctly
- capability explanations are materially untruthful
- response speed remains too poor for realistic conversation testing

### Go For Structured Testing

Aria is ready for structured testing when:

- core visible features pass
- response-time baseline and first-wave improvements are in place
- personality prompt pack and capability checks are prepared

## Deferred Until After This Board Is Cleared

- full animation upgrade
- Remotion-assisted motion authoring
- new expression families
- deeper visual polish

Reason:

- animation quality matters, but the current priority is responsiveness and full feature readiness for testing

## Current Status Snapshot

### Package B Progress

- Relationship screen pathing has been normalized to the canonical relationship metrics document:
  - `users/{uid}/relationshipMetrics/current`
- Backend now exposes `ensureRelationshipDashboard` to repair missing relationship dashboard docs for existing users.
- Relationship screen now invokes that repair path on load.
- Reaction overlay has been reworked from rising symbols into fixed-position head-area thought bubbles with in-place pop-out behavior.
- Backend changes have been deployed.
- Updated Android debug APK has been rebuilt and installed to device `70578ba3`.
- Relationship screen has been verified live on device after the backend repair + Firestore rules fix.
- Date Mode has been verified through start, active-session, resume, and end loops on device `70578ba3`.
- Live Mode has been verified through launch and return loops on device `70578ba3`.
- Transcript toggle and voice-only toggle have been re-checked on device `70578ba3`.
- The new thought-bubble overlay is now verified visible on-device after reinstall; symbols appear around Aria's head/background space instead of rising upward.
- Android build/install loop is now known-good through a project-local Gradle cache path:
  - `GRADLE_USER_HOME=tools/girlai2/.gradle-user-home`
  - direct wrapper build + `adb install -r`
- Fast reinstall path is now hardened for test cycles:
  - `tools/girlai2/scripts/build_android_debug.ps1 -UseExistingApkIfPresent -Install -DeviceId 70578ba3`
  - uses the actual Gradle output path `build/app/outputs/apk/debug/app-debug.apk`
  - avoids unnecessary rebuilds when a fresh debug APK already exists

### Package B Still Open

- Final consolidated smoke has now been re-run sequentially on `70578ba3` and confirmed for:
  - relationship screen
  - live mode
  - date mode
  - transcript toggle
  - voice-only toggle
- Package B visible feature-readiness sweep is now effectively green on the primary device.
- Remaining caution before formal close:
  - replay-on-return should still be watched during the next active-chat regression cycle, but no Package B surface failure blocked this smoke pass

### Package B Latest Validation

- Native Live2D relaunch bug on `70578ba3` has now been repaired:
  - old behavior: avatar could return as a blank surface after home -> relaunch
  - current behavior: the avatar survives relaunch and remains visible after the recovery path
- Evidence:
  - `tools/girlai2/docs/_tmp_resume_nativefix_launch10.png`
  - `tools/girlai2/docs/_tmp_resume_nativefix_roundtrip10.png`
  - `tools/girlai2/docs/_tmp_resume_nativefix_roundtrip16.png`
- Replay-on-return binary check now passes:
  - `tools/girlai2/docs/_tmp_replay_binary_check_20260325.txt`
  - after a voiced reply, three home/relaunch cycles produced no new:
    - `generateResponse`
    - `Generating voice`
    - `Playing audio`
- Package B is now effectively green on the primary device.

### Package A Progress

- Outer callable timings have now been added to `generateResponse`:
  - `historyFetchMs`
  - `datesContextMs`
  - `aiResponseMs`
  - `postPersistMs`
  - `totalCallableMs`
- `generateAIResponse` now parallelizes runtime bootstrap reads:
  - intelligent memory
  - runtime self-model / user profile
- Current-message date persistence now overlaps with generation instead of blocking it first.
- IN2017 latency baseline run:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_133519`
  - text p50 `4176ms`
  - text p90 `4512ms`
- Root-cause finding:
  - fast turns were still failing through Claude and OpenAI before finally succeeding on Gemini
- Fast-route provider order has been corrected:
  - fast turns now use `gemini-fast`
  - Anthropic/OpenAI now temporarily back off after connection-style failures
- Post-fix IN2017 run:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_134330`
  - text p50 `1742.5ms`
  - text p90 `2050ms`
- Package A status:
  - normal-turn text responsiveness is now in a good range on the primary device
  - voice latency is now acceptable enough to begin Package C on the primary device
  - see `tools/girlai2/docs/IN2017_VOICE_LATENCY_PASS_2026-03-25.md`

### Package C Progress

- Package C has now begun.
- Artifacts created:
  - `tools/girlai2/docs/PACKAGE_C_TEST_PROMPT_PACK.md`
  - `tools/girlai2/docs/PACKAGE_C_STATUS_2026-03-25.md`
- Local backend verification confirms capability/self-awareness questions route through:
  - `modelUsed: capability-router`
- Comparison-style capability prompts exposed a truncation bug in the capability router output.
- That bug has been fixed in:
  - `tools/girlai2/functions/src/services/llmService.ts`
- The fix has been deployed through:
  - `functions:generateResponse` on project `girlai2`
- Chronology language is now signed off as usable after the later chronology-router pass.
- Latest Package C hardening is now live:
  - deterministic capability-limit routing
  - recent-exchange-first memory behavior
  - tighter repair mode
  - tighter low-pressure short-reply handling
- Local validation artifact:
  - `tools/girlai2/docs/_tmp_package_c_probe_20260325.json`
- Full on-device Package C run after deploy:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_001316`
  - `promptsSent=28`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- Current Package C state:
  - capability truthfulness: usable
  - chronology truthfulness: usable
  - recent-exchange continuity: materially improved
  - repair behavior: improved but not signed off
  - low-pressure handling: materially improved
  - remaining need is semantic spot-checking of a few repair / continuity prompts in the live app, not another backend rewrite first

### Package B Visual Tuning

- Thought-bubble overlay was tuned again after the initial Package B restore:
  - more visible
  - more concentrated around Aria's head
  - fixed-position pop-out behavior retained
- Fresh screenshot verification:
  - `tools/girlai2/docs/_tmp_overlay_check_70578ba3_after5.png`

## Next Active Move

1. Tighten generic repair prompts so these stop failing semantically in live output:
   - `No, that is not what I said.`
   - `You are mixing up two different things.`
2. Polish natural callback wording so it sounds woven-in instead of explicit:
   - `Bring up one thing I mentioned before, naturally.`
3. Investigate App Check retry/rate-limit noise during dense automated prompt bursts on `70578ba3`.

### Package C Repair / Callback Follow-Up

- Generic mismatch repair has now been fixed and validated live enough to stop treating it as the main blocker.
- Natural callback routing was tightened again:
  - one recent fact is now preferred over merged open-loop summaries
  - this removes the specific cause of multi-thread callback blending
- Verification artifacts:
  - `tools/girlai2/docs/_tmp_package_c_probe_20260326_callback_fix/result.json`
  - `tools/girlai2/docs/_tmp_pkgc_manual_semantic_fix5_20260326/final.xml`
- Practical status:
  - repair behavior: usable
  - natural callback behavior: fixed in router logic and locally verified
  - one clean manual app-side callback spot-check is still worth doing before Package C is treated as fully signed off

## Updated Next Active Move

1. Do one quick manual human callback spot-check in the live app for:
   - `Bring up one thing I mentioned before, naturally.`
2. If that reads cleanly, treat Package C backend behavior as signed off.
3. Then move to the next remaining non-animation work item instead of more router churn.

### Latest Package C / Voice Truth Update

- Current profile `displayName` now explicitly outranks stale historical name facts in backend prompt assembly and fallback generation.
- Silent regular-tier voice-provider switching has been removed so Aria keeps a consistent persona voice instead of unexpectedly jumping to ElevenLabs.
- Ordinal suffixes are normalized before TTS, specifically to avoid spoken date artifacts like `April 3 R D`.
- Deploy completed for:
  - `functions:generateResponse`
  - `functions:generateVoiceMessage`
- Outstanding manual spot checks:
  - `What is my name?`
  - a voiced line containing `April 3rd, 2026`

## 2026-03-26 Voice Date Speech Fix

- Closed the known `April 3rd` speech bug in the voice path.
- `tools/girlai2/functions/src/services/voiceService.ts` now performs deterministic date normalization and Azure SSML date markup instead of relying on raw text pronunciation.
- This fix is backend-only and deployed to `generateVoiceMessage`.
- Manual verification prompt to run in app:
  1. `My interview is on April 3rd, 2026.`
  2. `Say that date back naturally.`
- Expected speech: `April third, twenty twenty-six` or natural Azure date speech, not `April 3 R D`.

## 2026-03-26 Voice Reliability Recovery

- First post-date-fix dense reruns exposed the real remaining voice problem on `70578ba3`:
  - Azure websocket path hit `429`
  - Azure REST fallback also hit `429 Quota Exceeded`
  - App Check warnings remained noisy but were not the actual failure gate
- Reliability changes now live in `tools/girlai2/functions/src/services/voiceService.ts`:
  - REST fallback uses REST-specific SSML instead of websocket viseme SSML
  - after confirmed Azure quota exhaustion, regular-tier voice enters a temporary `45s` provider cooldown and uses ElevenLabs directly instead of repeating Azure failures
- Evidence runs:
  - partial recovery run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_131038`
    - effective playback result: `3/4`
  - current recovery run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_132314`
    - effective playback result: `4/4`
    - `fatalCount=0`
    - `appAlive=True`
- Current Package A voice truth:
  - normal Azure path is still preferred when available
  - during quota exhaustion, reliability now wins over provider consistency
  - this is acceptable for test-readiness and responsiveness work on the primary device
- Still open:
  - clean up debug App Check invalid-token noise
  - decide later whether launch behavior should keep this multi-provider regular-tier fallback or move to a different quota strategy

## 2026-03-26 Follow-Up Sweep

### Package B / Readiness Update

- Re-verified on primary device `70578ba3`:
  - relationship screen
  - Live Mode entry
  - Date Mode entry
  - transcript focus toggle
  - voice-only toggle
  - thought-bubble entry point
- Supporting artifacts:
  - `tools/girlai2/docs/_tmp_pkgb_relationship.xml`
  - `tools/girlai2/docs/_tmp_pkgb_live_mode.xml`
  - `tools/girlai2/docs/_tmp_pkgb_date_mode.xml`
  - `tools/girlai2/docs/_tmp_pkgb_transcript_focus.xml`
  - `tools/girlai2/docs/_tmp_pkgb_voice_only.xml`
- Stale-name leak is now closed in live UI after the Gemini fallback memory normalization fix:
  - `tools/girlai2/docs/_tmp_name_verify_ui_loop.xml`
  - current visible greeting: `Hey Mike...`

### Package A / Diagnostics and Voice Update

- Local device-test diagnostics are now split so App Check warning spam is written to `logcat_appcheck_noise.txt` and the main test log remains readable.
- This is the practical stop point for debug builds until Firebase App Check debug-token registration is available with sufficient IAM permission.
- Focused IN2017 voice consistency run:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_134945`
  - `promptsSent=4/4`, `fatalCount=0`, `appAlive=True`, `pass=True`
- Current truth:
  - voice reliability is acceptable for continued testing
  - provider consistency still softens during Azure quota windows because fallback may shift to ElevenLabs to preserve playback

### Current non-animation blocker status

- Package B is effectively green on the primary device.
- Remaining pre-animation concerns are now mostly:
  1. debug App Check backend-noise cleanup if IAM for debug-token management becomes available
  2. more latency work where user-perceived turns still feel slow
  3. continued feature/personality validation under longer manual sessions

## 2026-03-27 Current Pass Update

### Package A: Responsiveness

- Implemented a stale-while-revalidate environment-context path in:
  - `tools/girlai2/lib/core/services/context_service.dart`
- Added context prewarming on:
  - chat entry in `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
  - location opt-in enable in `tools/girlai2/lib/features/settings/screens/settings_screen.dart`
- Live IN2017 evidence:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_003112`
  - first captured turn: `datesContextMs=747`
  - later captured turn: `datesContextMs=64`
- Interpretation:
  - city/time/weather context no longer repeatedly blocks normal turns after warmup
  - remaining user-visible responsiveness problem is now voice startup, not repeated context gathering

### Fuller Motion Work Started

- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart` now has a first fuller-runtime motion layer:
  - `16ms` animation cadence instead of `33ms`
  - fuller speaking arm/hand/torso choreography
  - partial speech blinks instead of eye-freeze behavior while talking
- Supporting motion burst capture:
  - `tools/girlai2/docs/_tmp_motion_burst_20260327`
- Practical status:
  - motion layering is active enough to keep
  - fuller animation work should continue only after the next voice-latency pass, since voice is still the main user-perceived delay

## Updated Next Active Move

1. Do the next voice responsiveness pass:
  - reduce voiced-turn startup where possible
  - measure callable vs local audio load again on `70578ba3`
2. Keep Package B stable:
  - no regressions on relationship, Live Mode, Date Mode, transcript toggle, or replay-on-return
3. After the next voice pass, continue the fuller animation work from the new runtime-motion baseline instead of restarting it from scratch

## 2026-03-27 Follow-Up: Voice Responsiveness Under Throttle

- Voice follow-up found an avoidable latency case in `tools/girlai2/functions/src/services/voiceService.ts`:
  - active Azure throttle cooldown could still impose a wait before another attempt sequence
- Current fix:
  - during an active Azure throttle cooldown, regular-tier voice now skips the wait and goes straight to ElevenLabs if fallback is configured
  - only no-fallback environments still wait out the cooldown
- Validation completed:
  - functions build passed
  - `generateVoiceMessage` redeployed
- Interpretation:
  - this removes dead time during throttled windows
  - remaining voice responsiveness work should focus on healthy-run synthesis and client load/start costs, not this cooldown branch again

## 2026-03-27 Sub-Agent Execution Note

- Current phase is being executed against the existing Aria sub-agent operating model:
  - Latency / voice
  - feature reliability
  - personality / chronology
  - avatar motion
- Integration rule remains unchanged:
  - disjoint file ownership is respected
  - cross-cutting merges stay with the lead integrator

## 2026-03-27 Feature Reliability Sweep

- Added a fail-soft relationship dashboard guard in `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`.
- `dart analyze` passed on the touched chat, relationship, and firebase files.
- Reinstall + device stress loop on `70578ba3` completed without fatal errors.
- Limitation: the reinstall landed the device on the login screen, so authenticated feature-surface validation still needs a logged-in pass before declaring the full sweep done.
- Current reliability posture:
  - replay-on-return remains guarded
  - Live Mode and Date Mode wiring remain intact
  - relationship dashboard is safer against malformed snapshot data

## 2026-03-27 Current Integrated State

### Accepted in this pass

- Responsiveness:
  - stale-while-revalidate context cache
  - chat/settings prewarm
- Voice:
  - lighter long-form Azure output profile
  - better long-form delivery profile
  - richer timing visibility in `generateVoiceMessage`
- Avatar:
  - first fuller runtime speaking-motion layer
  - quiet head-anchored thought-bubble overlay
- Reliability:
  - fail-soft relationship dashboard guard

### Validation completed

- `dart analyze` clean on the touched Flutter files
- `npm run build` clean in `tools/girlai2/functions`
- Android debug rebuild + install completed on `70578ba3`

### Remaining blocker before declaring the first-6 sweep complete

- Both connected Android devices are currently at the phone-auth login shell.
- That blocks authenticated verification for:
  - relationship screen
  - Live Mode
  - Date Mode
  - replay-on-return in real chat
  - thought-bubble behavior in live conversation

### Next concrete action

1. Log in on either connected device.
2. Run the authenticated sweep in this order:
  - relationship screen
  - Live Mode
  - Date Mode
  - send one voiced chat turn
  - background/return replay check
  - thought-bubble visual check

## 2026-03-27 Authenticated Sweep Result

### Green on primary device `70578ba3`

- Relationship screen opens and renders live metrics.
- Live Mode opens and camera permission flow works.
- Date Mode chip opens the `Start a Virtual Date` sheet.
- Two-prompt voiced chat run with one background/resume cycle passed:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_052304`
- Replay-on-return did not reproduce in that authenticated run.

### Fixed during the sweep

- Thought-bubble overlay geometry was corrected in:
  - `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`
- Verified post-fix:
  - `tools/girlai2/docs/_tmp_post_bubble_fix_launch.png`
  - bubbles now sit around Aria's head/background space instead of the top corners

### Remaining pre-full-animation concerns

1. Voice startup is still the biggest user-visible delay on voiced turns.
2. Voice provider consistency can still soften during Azure throttle windows.
3. Fuller animation now has a better base, but still needs a dedicated polish pass rather than more feature-readiness work.

## 2026-03-27 Voice + Animation Follow-Up Result

### Package A / Animation follow-up summary

- Voice startup follow-up landed:
  - added intermediate ElevenLabs `mp3_44100_96` tier for medium turns
  - validated on `70578ba3` with focused short and longer-turn probes
- Fuller animation follow-up landed:
  - damped double-counted speech-energy contribution in the screen-space motion layer
  - made thought bubbles intermittent and locally randomized instead of a constant deterministic loop
- Validation status:
  - `npm run build` passed in `tools/girlai2/functions`
  - `dart analyze` passed on `avatar_view.dart` and `avatar_reaction_overlay.dart`
  - `generateVoiceMessage` redeployed successfully
  - Android debug rebuild + install completed on `70578ba3`

### Measured device runs

1. Short-turn probe:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061415`
  - total startup samples: `3115ms`, `2152ms`
  - audio format: `mp3_44100_96`

2. Longer-turn probe:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523`
  - total startup samples: `2328ms`, `1947ms`
  - audio format: `mp3_44100_128`

### Current truth after this pass

- Short and medium voiced turns now feel much better on `IN2017`.
- Voice consistency is still constrained by Azure throttle fallback policy during provider pressure.
- Thought bubbles now behave much closer to the intended silent head-space communication layer.
- Fuller animation now has a better baseline and is ready for a dedicated polish pass instead of more foundation work.

### Best next move

1. Do a dedicated voice-consistency polish pass if the fallback timbre shift still bothers you.
2. Otherwise move straight into fuller animation polish:
  - gesture variety
  - cleaner speaking state transitions
  - stronger idle/listening life
  - broader arm / hand expressiveness where the rig allows it

## 2026-03-27 Identity Regression Follow-Up

### What was fixed

- Old-name leakage is now blocked across the backend prompt assembly path.
- Direct name prompts now use a deterministic `name-router`.

### Files touched

- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/ariaPersonaService.ts`
- `tools/girlai2/functions/src/services/llmService.ts`

### Verified live on `70578ba3`

1. `What is my name?`
  - returned `You're Mike...`
2. `What should you call me?`
  - now returns `I should call you Mike. That is the name I should use unless you tell me to change it.`

### Evidence

- `tools/girlai2/docs/_tmp_name_verify_live_20260327/window_dump_transcript.xml`
- `tools/girlai2/docs/_tmp_name_verify_live_20260327_after_router/window_dump_transcript.xml`

### Current truth

- The stale `welo` leak is closed on the primary device.
- The user-name surface is now deterministic enough for broader feature testing.
- Next priority remains:
  1. fuller animation polish
  2. voice consistency polish if fallback timbre still feels too inconsistent

## 2026-03-27 Repetitive Closing Fix

### What was fixed

- Aria was overusing the same closing family, especially `we can keep this...`
- That repetition was traced to backend response guards, not just model drift

### Files touched

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/docs/_tmp_context7_review/20260327_1355/WORDING_REPETITION_NOTE.md`

### What changed

- diversified warm closers
- diversified short-reply lightness tails
- diversified engagement hooks
- added a cleanup pass that strips / rewrites the overused closing family even if it comes back from generation

### Live check

- Device: `70578ba3`
- Evidence:
  - `tools/girlai2/docs/_tmp_wording_check_20260327/window_dump.xml`
- Latest visible reply in the focused pass no longer used the old `we can keep this...` ending family

### Current truth

- The specific repetitive closing family is now actively suppressed
- Broader personality wording variety can still be improved later, but this known repetitive stem should stop dominating endings

## 2026-03-27 Persona Refactor Status

### Completed in this pass
- Truth Kernel extraction + integration
- Memory Controller extraction + initial integration
- Conversation Policy extraction + initial integration
- Functions build green after wiring

### What changed operationally
- `llmService.ts` now defers runtime truth to `truthKernelService.ts`
- recent-exchange precedence is no longer purely heuristic last-item ordering
- question-budget / repair / consent constraints now have a dedicated service owner

### Next architecture steps after current product priorities
1. move more prompt-assembly truth/capability wording behind the Truth Kernel
2. migrate memory lifecycle mutations to the Memory Controller action model
3. shrink `llmService.ts` further by moving policy prompt assembly into the Conversation Policy layer

## 2026-03-27 Clean Branch Semantic Sweep

Primary record:
- `tools/girlai2/docs/CLEAN_BRANCH_PERSONA_SEMANTIC_SWEEP_2026-03-27.md`

Current clean-branch status on `70578ba3`:
- capability overview: pass
- capability limits: pass
- chronology capture: pass
- second dated fact capture: pass
- natural callback: functional pass, but still too managed in tone
- repair reset: pass after fix; now anchors to the dinner topic instead of the meta callback prompt

Immediate architecture follow-ups from the sweep:
1. move runtime truth-state construction out of `llmService.ts`
2. remove duplicated conversation-key normalization and the thin chronology wrapper seam
3. split policy from realization so callback and repair language stop sounding managed

Current decision:
- keep developing from the clean branch
- treat the original dirty `sdk-updates` tree as quarantine/source only until later archive review
