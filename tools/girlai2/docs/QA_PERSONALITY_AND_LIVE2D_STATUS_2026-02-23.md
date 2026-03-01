# QA + Personality + Live2D Status (2026-02-23)

## Context7 proof used in this pass
- `tools/girlai2/docs/_tmp_context7_review/20260223_042934/codex_context7_exec.jsonl`
- `tools/girlai2/docs/_tmp_context7_review/20260223_051207/codex_context7_exec.jsonl`

## Backend deploy status
- Functions deployed:
  - `generateResponse` (project `girlai2`) deployed at least twice in this pass (after capability hardening + route refinement).
- Build status:
  - `tools/girlai2/functions`: `npm run build` passed.

## Capability/self-awareness verification
Validated on-device with targeted prompts and UI XML extraction:
- Prompt: `what can you do in simple terms`
  - Result: deterministic capability overview (concise sectioned response).
- Prompt: `what features are active for me right now`
  - Initial result: non-deterministic style response.
  - Fix applied: expanded direct capability intent phrase coverage (`what features`, `which features`, `features are active`).
  - Recheck result: deterministic capability overview returned.
- Prompt: `how are you different from other ai girlfriend apps`
  - Result: deterministic capability overview returned.
- Prompt: `give me full detailed list of your capabilities and demo prompts`
  - Result: expanded capability overview path returned.

Evidence folder:
- `tools/girlai2/docs/_tmp_personality_audit/capability_validation_20260223_050851`

## Native/avatar reliability changes in this pass
Added render-heartbeat watchdog path:
- New JNI bridge method to report render frame age.
- Flutter health checks now trigger recover/reload when frame age is stale for repeated intervals.

Files changed:
- `tools/girlai2/android/app/src/main/cpp/JniBridgeC.cpp`
- `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/JniBridgeJava.java`
- `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/Live2DGLSurfaceView.java`
- `tools/girlai2/android/app/src/main/kotlin/com/sifstudio/girlai2/live2d/Live2DMethodChannelHandler.kt`
- `tools/girlai2/lib/features/avatar/live2d/live2d_bridge.dart`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`

## Device regression loops run
### Run A (post-deploy)
- Device: `70578ba3`
- Output: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260223_051421`
- Summary: `promptsSent=24/24`, `cycles=5`, `fatalCount=0`, `appAlive=True`, `pass=True`
- Screenshot black-frame heuristic: `0/30 likely black`

### Run B (post-patch watchdog)
- Device: `R5CN6059D0V`
- Output: `tools/girlai2/docs/_tmp_aria_device_test/R5CN6059D0V/20260223_045954`
- Summary: `promptsSent=24/24`, `cycles=5`, `fatalCount=0`, `appAlive=True`, `pass=True`
- Screenshot black-frame heuristic: `25/30 likely black`

## Interpretation of remaining issue
- The second device still captures many black avatar frames in `adb screencap` during stress cycles, while app process remains healthy and no native fatal is present.
- This likely indicates a device/capture path issue with `SurfaceView` composition (capture artifact) OR a still-unresolved resume/render presentation issue specific to that hardware/ROM path.

## Next targeted actions
1. Validate black-frame symptom via direct human-eye check on `R5CN6059D0V` while test runs (to confirm real UI issue vs capture artifact).
2. Add optional Flutter fallback renderer path for diagnostic mode (TextureView path or forced reattach on resume) only for affected devices.
3. Add an in-app diagnostic overlay showing render heartbeat age and `hasModel/surfaceReady` live values for faster triage.
4. Keep running the same 24-prompt stress cycle after each tweak until both devices show stable avatar visibility by both human observation and captures.
