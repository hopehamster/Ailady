# Live2D Android Setup (girlai2)

## 1) Cubism SDK location
The Android native bridge expects the Cubism Native SDK path from one of these:

1. `android/local.properties` key:
   - `live2d.sdk.dir=C:/path/to/CubismSdkForNative-5-r.4.1`
2. Environment variable:
   - `LIVE2D_SDK_ROOT=/path/to/CubismSdkForNative-5-r.4.1`

If neither is set, the build falls back to:
- `C:/Users/Owner/Documents/CubismSdkForNative-5-r.4.1`

## 2) Live2D assets
Current model assets are expected at:
- `assets/live2d/bezzly/`

Model entry path used by Flutter bridge:
- `flutter_assets/assets/live2d/bezzly/bezzly.model3.json`

## 3) Build command
From `tools/girlai2`:

```powershell
flutter build apk --debug
```

## 4) Implemented bridge methods
MethodChannel: `girlai2/live2d_bridge`

- `loadModel(modelJsonPath)`
- `setExpression(name)` where `name` is one of `Happy`, `Sad`, `Angry`, `Neutral`
- `setParameter(id, value)`
- `setParameters(parameters)`
- `pause()`, `resume()`, `dispose()`

## 4.1) State-Driven Screen Motion (Flutter-side)
Whole-avatar screen-space movement is now driven in Flutter via:
- `lib/features/avatar/motion/avatar_motion_controller.dart`

This layer controls:
- root offset X/Y
- root scale (closer/farther feel)
- additive shake bursts (time-limited)
- speaking bounce (excited state)
- 3-minute idle autonomy cycle (`Sad -> Frustrated`) when no interaction occurs

API used by `AvatarView`:
- `applyState(emotion, intensity, speaking)`
- `ApplyState(emotion, intensity, speaking)` (alias)
- `tick(now)`
- `onInteraction()`
- `reset()`

Notes:
- This is screen-space root motion only, not limb/bone motion authoring.
- Native MethodChannel did not need new methods; it still uses `setViewTransform`.

## 5) Current scope
- Android native Live2D rendering is wired.
- Unity dependency path is removed from `tools/girlai2`.
- Emotion and viseme events from chat are mapped to Live2D expressions and mouth parameters.
- iOS bridge is not implemented yet (Mac handoff checkpoint comes after Android validation).

## 6) Voice backend config (stabilized path)
Voice generation now reads env/params values (instead of `functions.config()` in the voice flow):

- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION` (default: `eastus`)
- `AZURE_VOICE_NAME` (default: `en-US-JennyNeural`)
- `ELEVENLABS_API_KEY`
- `ELEVENLABS_VOICE_ID`
- `VOICE_AUDIO_BUCKET` (optional override; defaults to `admin.storage().bucket()`)
- `VOICE_DEV_BYPASS_UIDS` (comma-separated Firebase Auth UIDs for dev bypass)

Notes:
- Dev bypass is server-side only and only applies to allowlisted authenticated UIDs.
- Voice URLs are returned via signed URL with fallback tokenized URL if signing is unavailable.
- Legacy `functions.config()` values still work as fallback during migration.
