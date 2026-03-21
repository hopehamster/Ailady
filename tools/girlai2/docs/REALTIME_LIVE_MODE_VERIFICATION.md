# Realtime Live Mode Verification

## What This Slice Includes
- `createRealtimeSession` callable for ephemeral OpenAI Realtime client secrets
- direct Flutter WebRTC connection to `POST /v1/realtime/calls`
- native Realtime audio output in live mode
- passive sampled camera frames sent over `oai-events`
- live-mode UI with connection state, mic mute, captions, and fallback callable path preserved in code

## Minimum Verification Before Deploy
- `npm run build` in `tools/girlai2/functions`
- `flutter analyze` on the touched live-mode files
- `flutter build apk --debug`
- confirm `OPENAI_API_KEY` is configured for Cloud Functions
- deploy `createRealtimeSession` before testing the new live path on device
- confirm the app still opens in the classic callable live-mode path by default
- confirm Realtime preview only works for internal tester accounts

## Debug Signals To Watch
- `FirebaseService.createRealtimeSession`: session mint start/success/failure
- `RealtimeSessionService.connect`: mint, data-channel open, and failure timing
- `RealtimeSessionService.sendPassiveVisionFrame`: frame-sync checkpoints
- `RealtimeSessionService.disconnect`: clean shutdown

## QA Checklist
- Launch live mode with camera + microphone permissions granted
- Confirm classic mode still works end-to-end without using Realtime
- Confirm the status pill moves `READY -> CONNECTING -> LIVE`
- Speak to Aria and confirm direct audio output is heard without `generateVoiceMessage`
- Confirm assistant captions stream while audio is playing
- Confirm camera switching preserves the same Realtime session
- Mute and unmute the mic during an active session
- Background and foreground the app; confirm live mode stops cleanly
- Disable network mid-session; confirm a visible failure state
- Re-enter live mode after failure without restarting the app
- Force a Realtime failure and confirm the app falls back to classic live mode instead of leaving the feature unusable

## Android Device Focus
- Primary device: IN2017
- Secondary Android profile: at least one additional device with a different audio route setup
- Verify speakerphone behavior with:
  - handset speaker
  - Bluetooth audio if available
  - wired headset if available

## Rollback
- The callable live-mode path remains in `CameraService` and `processLiveModeInput`
- If Realtime is unstable, keep the new code in source but route the screen back to the callable transport until direct sessions are proven
- Do not remove `processLiveModeInput` until Realtime has passed device verification
- Production-safe default remains `Classic` until Realtime is explicitly promoted

## Git Recovery Rule Before First Realtime Deploy
- Commit this slice as a named milestone
- Push it to GitHub
- Tag the first usable checkpoint as `realtime-token-endpoint` or `realtime-audio-first-pass`, depending on what is being deployed
