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

## 5) Current scope
- Android native Live2D rendering is wired.
- Unity dependency path is removed from `tools/girlai2`.
- Emotion and viseme events from chat are mapped to Live2D expressions and mouth parameters.
- iOS bridge is not implemented yet (Mac handoff checkpoint comes after Android validation).