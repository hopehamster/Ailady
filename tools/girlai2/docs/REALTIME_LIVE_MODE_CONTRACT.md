# Realtime Live Mode Contract

## Purpose
This document is the source of truth for the dedicated Realtime live-mode spine.
It exists so the feature can be recovered from tracked source even if local state,
memory, or ad-hoc experiments are lost.

## Backend Entry Point
- Firebase callable: `createRealtimeSession`
- File: `tools/girlai2/functions/src/index.ts`
- Service helper: `tools/girlai2/functions/src/services/realtimeSessionService.ts`

## Client Entry Points
- Firebase bridge: `tools/girlai2/lib/core/services/firebase_service.dart`
- Realtime transport: `tools/girlai2/lib/features/camera/services/realtime_session_service.dart`
- Camera sampler: `tools/girlai2/lib/features/camera/services/camera_service.dart`
- Live UI: `tools/girlai2/lib/features/camera/screens/camera_vision_screen.dart`

## Current Realtime Session Shape
- Transport: direct client-to-OpenAI WebRTC
- Protected endpoint used by backend: `POST /v1/realtime/client_secrets`
- Client WebRTC SDP exchange: `POST /v1/realtime/calls`
- Model: `gpt-realtime`
- Voice: `marin`
- Output modalities: `audio`, `text`
- Audio format: PCM 24 kHz
- Turn detection: `semantic_vad` with automatic response creation and interruption
- Vision strategy: sampled passive `input_image` messages sent over the `oai-events` data channel

## Safety Guardrails
- The protected default transport is still the existing callable live-mode path.
- The Realtime path is currently an internal preview and the backend only mints Realtime sessions for internal tester accounts.
- In debug builds, transport can be switched manually between `Classic` and `Realtime`.
- If Realtime connection fails, the screen automatically falls back to the classic callable path instead of leaving live mode broken.
- Normal chat, normal TTS, and the rich avatar path remain separate from this rollout.

## Passive Vision Rule
Live camera frames are currently sent as background visual context, not as a
standalone turn that should always trigger a reply. This keeps phase 1 focused
on low-latency full-duplex conversation while vision continuously informs what
Aria understands about the scene.

## Recovery Rules
- Every deployable milestone must exist in tracked source.
- No backend entrypoint may exist in production without a matching file in git.
- Stable milestones should be committed and pushed to GitHub before the next major change.
- Recommended checkpoint tags:
  - `live-mode-callable-baseline`
  - `realtime-token-endpoint`
  - `realtime-audio-first-pass`
  - `realtime-vision-first-pass`
  - `realtime-live-ui-first-pass`

## Fallback Rule
The callable live-mode path (`processLiveModeInput`) remains the fallback until
Realtime live mode is validated on device and considered stable. Do not remove
or bypass the callable path until Realtime has passed device QA and rollback is
no longer needed.
