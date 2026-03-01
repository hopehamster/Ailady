# Context7 Review - 7 Bug Fixes (2026-02-22)

## Proof of Context7 usage
- Query log: `tools/girlai2/docs/_tmp_context7_review/20260222_173657/context7_calls.log`
- Raw Context7 outputs used in this review:
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_flutter_platform_view.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_flutter_lifecycle.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_android_developer_glsurface.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_android_developer_glsurface2.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_firebase_functions_callable.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_firebase_js_callable.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_azure_speech_ssml.json`
- `tools/girlai2/docs/_tmp_context7_review/20260222_173657/c7_js_date_timezone.json`
- Context7 API parameter reference used to correct calls (`libraryId` + `query`): `tools/girlai2/docs/_tmp_context7_review/context7_api_guide.html`

## Review matrix (7 fixes)

### 1) Black-avatar resume bug fix
Status: **Aligned**
- Context7 basis:
- Flutter platform views guidance (`PlatformViewLink` + `AndroidViewSurface` + `PlatformViewsService.initSurfaceAndroidView`) from `c7_flutter_platform_view.json`.
- Lifecycle observer guidance (`WidgetsBindingObserver`, `didChangeAppLifecycleState`, add/remove observer in init/dispose) from `c7_flutter_lifecycle.json`.
- Code checked:
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:203`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:237`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:779`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:1664`
- `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/Live2DGLSurfaceView.java:31`
- `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/Live2DGLSurfaceView.java:134`
- `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/Live2DGLSurfaceView.java:149`
- `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/Live2DGLSurfaceView.java:187`
- Review note:
- Resume path, deferred model reload, and surface-ready gating match the lifecycle handling pattern.

### 2) Deterministic chronology dates
Status: **Aligned**
- Context7 basis:
- MDN Date/UTC guidance (`Date.UTC`, `getUTCDay`, UTC-safe conversions) from `c7_js_date_timezone.json`.
- Code checked:
- `tools/girlai2/functions/src/services/memoryService.ts:1035`
- `tools/girlai2/functions/src/services/memoryService.ts:1049`
- `tools/girlai2/functions/src/services/memoryService.ts:1094`
- `tools/girlai2/functions/src/services/llmService.ts:2043`
- `tools/girlai2/functions/src/services/llmService.ts:2203`
- Review note:
- Logic uses explicit UTC conversions with controlled offset and avoids local-time implicit parsing drift.

### 3) User timezone storage/use
Status: **Aligned**
- Context7 basis:
- Firebase callable contract (`request.data`, `request.auth`) from `c7_firebase_functions_callable.json`.
- Client functions error/details model from `c7_firebase_js_callable.json`.
- Code checked:
- `tools/girlai2/functions/src/index.ts:105`
- `tools/girlai2/functions/src/index.ts:204`
- `tools/girlai2/functions/src/index.ts:230`
- `tools/girlai2/lib/core/services/firebase_service.dart:163`
- `tools/girlai2/lib/core/services/firebase_service.dart:165`
- `tools/girlai2/lib/core/services/firebase_service.dart:166`
- Review note:
- Client sends timezone metadata each turn and backend persists then consumes it for chronology.

### 4) Weekday/date mismatch correction assertion
Status: **Aligned**
- Context7 basis:
- MDN UTC weekday/date semantics from `c7_js_date_timezone.json`.
- Code checked:
- `tools/girlai2/functions/src/services/llmService.ts:2164`
- `tools/girlai2/functions/src/services/llmService.ts:2203`
- `tools/girlai2/functions/src/services/llmService.ts:3443`
- `tools/girlai2/functions/src/services/llmService.ts:3465`
- Review note:
- Post-generation guard corrects weekday/date mismatch and appends absolute clarification when user used relative time.

### 5) Topic choreography + open-loop cadence
Status: **Aligned (product-logic; no API mismatch)**
- Context7 basis:
- No external API contract for this behavior; this is deterministic policy logic.
- Code checked:
- `tools/girlai2/functions/src/services/llmService.ts:2682`
- `tools/girlai2/functions/src/services/llmService.ts:2841`
- `tools/girlai2/functions/src/services/llmService.ts:2960`
- `tools/girlai2/functions/src/services/llmService.ts:2961`
- Review note:
- Added low-friction short-reply choreography and callback throttling to avoid repetitive loop prompts.

### 6) Animation liveliness improvements
Status: **Aligned (runtime integration), needs artist motion files for full range**
- Context7 basis:
- Flutter lifecycle/platform-view stability references from `c7_flutter_platform_view.json` and `c7_flutter_lifecycle.json`.
- Code checked:
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:1417`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:1537`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:1067`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart:1083`
- Review note:
- Procedural motion, blink, and speaking micro-motion are implemented; full authored expressive range still depends on additional artist motion assets.

### 7) Voice naturalness improvements
Status: **Aligned**
- Context7 basis:
- Azure SSML `mstts:express-as` style/styledegree + `prosody` usage from `c7_azure_speech_ssml.json`.
- Code checked:
- `tools/girlai2/functions/src/services/voiceService.ts:168`
- `tools/girlai2/functions/src/services/voiceService.ts:191`
- `tools/girlai2/functions/src/services/voiceService.ts:251`
- `tools/girlai2/functions/src/services/voiceService.ts:271`
- `tools/girlai2/functions/src/services/voiceService.ts:397`
- `tools/girlai2/functions/src/services/voiceService.ts:566`
- Review note:
- SSML style/prosody parameters are now dynamic and within documented ranges; emoji/pictograph stripping in TTS path is in place.

## Findings requiring follow-up (not blockers)
- `Live2DGLSurfaceView` intentionally avoids native destroy in `onFlutterDispose` to prevent black-screen regressions across platform-view recreation. This is stable-first behavior, but it should be watched for long-session native memory growth.
