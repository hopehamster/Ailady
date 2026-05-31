# Track E — Auxiliary Services Migration (Crashlytics, Analytics, App Check, FCM)

Status: planning only. No code changes.
Owner: solo dev. Target: Cloudflare-centric stack, off Firebase.
Companion tracks: A (auth), B (data/storage), C (compute), D (DB/realtime).

## 1. Service inventory (what Aria actually does today)

### 1a. Crashlytics — minimal surface
- `pubspec.yaml:21` — `firebase_crashlytics: ^4.1.3`
- All wiring lives in `lib/main.dart:50-58, 107`. Exactly three call sites:
  - `setCrashlyticsCollectionEnabled(!kDebugMode)` (line 50)
  - `FlutterError.onError` → `recordFlutterFatalError` (line 52-54)
  - `PlatformDispatcher.instance.onError` → `recordError(fatal: true)` (line 55-58)
  - `runZonedGuarded` → `recordError(fatal: true)` (line 107)
- Grep across `lib/` confirms ONLY `main.dart` calls Crashlytics. No bespoke `recordError(...)` in feature code.
- **Implication:** the surface is essentially the four global hooks. Easy swap.

### 1b. Analytics — wrapper exists, barely used
- `pubspec.yaml:20` — `firebase_analytics: ^11.3.3`
- `lib/core/services/analytics_service.dart` defines ~20 named events (snake_case): `session_start`, `login_*`, `message_sent`, `voice_*`, `live_mode_*`, `paywall_viewed`, `subscription_purchased`, etc.
- **Only one call site exists today:** `main.dart:63` (`sessionStart()`). Across `lib/`, no feature code calls `AnalyticsService().*` — the wrapper was scaffolded but never wired into features.
- `setUserId` + `setUserProperty` defined but unused.
- **Implication:** analytics has near-zero behavioural dependency. Trivial to swap (or skip entirely until needed).

### 1c. App Check — release-only, two providers
- `pubspec.yaml:19` — `firebase_app_check: ^0.3.1+3`
- `lib/main.dart:69-87`. Activated only in release builds:
  - Android: `AndroidProvider.playIntegrity`
  - iOS: `AppleProvider.appAttestWithDeviceCheckFallback`
- Token pre-fetched at boot to avoid first-callable latency
- **Currently NOT enforced server-side** — `main.dart:67` comment: "callable enforcement is disabled"
- **Implication:** App Check today is configured but not actually gating anything. The abuse-protection model is effectively absent. Cloudflare migration is a chance to add it properly.

### 1d. Messaging (FCM) — full client+server stack
- `pubspec.yaml:17` — `firebase_messaging: ^15.1.3`
- Client: `lib/core/services/notification_service.dart` (~290 lines)
  - Background handler at top-level (`@pragma('vm:entry-point')`)
  - `requestPermission`, foreground banner via `ScaffoldMessenger`, tap → deep-link route (`/chat`, `/relationship`, `/settings`)
  - iOS APNs token check before `getToken()`
  - Token refresh listener
- Server: `functions/src/index.ts`
  - `registerFCMToken` callable (lines 2019-2052) — stores token at `users/{uid}/fcmTokens/{token}` with platform + active flag
  - `sendPushToUser` internal helper (lines 2058-2124) — fan-out via `admin.messaging().send()`, auto-deactivates invalid tokens
  - `sendPushOnNewAriaMessage` Firestore trigger (lines 2134-2160) — fires on new `conversations/{id}` doc where `isFromUser !== true`, formats "Aria 💌" + content preview, deep-links to `chat`
- **Implication:** this is the most complex aux service. iOS still requires APNs (no escaping Apple); only the FCM middle-layer is replaceable.

---

## 2. Replacement options + recommendations

### 2a. Crashlytics → **Sentry**

| Option | Verdict |
|---|---|
| **Sentry** | RECOMMENDED. Free tier (5K events/mo) covers Aria's testing volume. Mature `sentry_flutter` SDK. Same `Zone`/`FlutterError`/`PlatformDispatcher` hooks → drop-in. |
| GlitchTip | Self-hostable Sentry-compatible. Defer — adds ops burden. Revisit if Sentry pricing bites at scale. |
| Bugsnag | Comparable; smaller ecosystem; no advantage over Sentry. |

**Why Sentry:** identical mental model to Crashlytics (init at boot, install global error hook), zero net new concepts, source maps + release tracking + breadcrumbs are upgrades.

### 2b. Analytics → **PostHog** (with "skip until needed" as a valid alt)

| Option | Verdict |
|---|---|
| **PostHog** | RECOMMENDED. Free tier 1M events/mo; self-host option later; product-analytics shape (funnels, retention) > pageview shape. Strong Flutter SDK. |
| Plausible | Privacy-first but pageview-centric; weak for in-app custom events. |
| Cloudflare Web Analytics | Free but web-only; doesn't fit a mobile app's event stream. |
| **Skip until PMF** | VALID. Aria has near-zero analytics dependency today; founder could defer the swap entirely and revisit when product-decisions need data. |

**Owner decision needed:** does Aria need analytics at all right now, or is crash + push enough? (Open question #1.)

### 2c. App Check → **Cloudflare Workers + custom token binding**

App Check protected *Firebase* endpoints. After cutover, the new compute layer is Cloudflare Workers — so the protection moves into the Worker auth layer itself.

| Option | Verdict |
|---|---|
| **Workers + custom verification** | RECOMMENDED. The Worker that fronts each callable already verifies the user's auth token (Track A); add a device-attestation token check on top: iOS DeviceCheck/App Attest assertion + Android Play Integrity verdict, validated server-side in the Worker. |
| Cloudflare Turnstile | Wrong shape — it's CAPTCHA for forms, not app-to-API attestation. |
| Skip entirely | TENABLE short-term given App Check isn't enforced today anyway. Bump to proper attestation in a later sprint. |

**Recommendation:** ship cutover without attestation (parity with today), add Worker-side Play Integrity + App Attest verification in a follow-up.

### 2d. FCM → **Workers + direct APNs/FCM HTTP v1**

iOS pushes MUST go through Apple's APNs. Android pushes go through Google's FCM HTTP v1 endpoint. Neither can be "replaced" — only the orchestration layer (currently `admin.messaging()` in Firebase Functions) changes.

| Option | Verdict |
|---|---|
| **Worker → APNs (token auth, .p8) + FCM HTTP v1 (service account JWT)** | RECOMMENDED. No vendor lock, no per-message fees, ~150 lines of Worker code. Token registry moves to D1/KV (Track B/D). |
| OneSignal | Easy but adds a vendor and a $99/mo cliff above 10K subs. Defer unless onboarding pain warrants. |
| Expo Push | Designed for Expo apps; awkward for Flutter; still relays to APNs/FCM under the hood. |

**Why direct:** Aria's send pattern is simple (one notif per new Aria msg, no campaigns, no segmentation). The Worker-direct path is straightforward and free.

---

## 3. Migration plan per service

### 3a. Crashlytics → Sentry (0.5 day)
1. Create Sentry org + Flutter project; capture DSN.
2. Add `sentry_flutter` to `pubspec.yaml`; remove `firebase_crashlytics`.
3. Replace `main.dart:29-108` global error handlers with `SentryFlutter.init(...)` wrapping `runApp`; `FlutterError.onError` and `PlatformDispatcher.onError` become Sentry hooks.
4. Run dual-write for one week: keep Crashlytics SDK installed alongside Sentry; once Sentry shows ≥1 captured crash from each platform, remove Crashlytics.
5. Add release tracking via Sentry's `release` config (version+build from `pubspec.yaml`).

### 3b. Analytics → PostHog (0.5–1 day if migrating, 0 days if deferring)
1. Decide: migrate or defer (open question for owner).
2. If migrating: add `posthog_flutter`; replace `AnalyticsService._analytics` field with PostHog client; keep the wrapper's public API identical so feature code doesn't have to change (and `main.dart:63` keeps working).
3. Map events 1:1 (PostHog has no 40-char limit).
4. Remove `firebase_analytics` from `pubspec.yaml`.

### 3c. App Check → Worker attestation (defer, ~1 day when prioritized)
1. Short-term: do nothing. Remove `firebase_app_check` from `pubspec.yaml` and `main.dart:69-87`. Parity with today.
2. Later: in each callable Worker, accept a per-request attestation header (App Attest assertion on iOS, Play Integrity token on Android).
3. Verify Play Integrity via Google's verification API; verify App Attest via Apple's public keys + nonce.
4. Reject requests without valid attestation in production.

### 3d. FCM → Worker-direct APNs/FCM (3–4 days)
1. **Token registry:** create `push_tokens` table in D1 (or KV) mirroring the current `users/{uid}/fcmTokens/{token}` shape: `(user_id, token, platform, registered_at, active)`. New callable Worker `registerPushToken` replaces `registerFCMToken`.
2. **APNs key:** generate APNs Auth Key `.p8` in Apple Developer; store as Worker secret. Implement JWT signing for APNs `Authorization: bearer` header (ES256, 1-hour TTL, cache).
3. **FCM HTTP v1:** create Google Cloud service account (Android-only, no Firebase project required — uses FCM Project ID), store JSON as Worker secret. Implement OAuth2 JWT→access-token flow.
4. **`sendPushToUser` port:** new internal Worker function that reads `push_tokens` for `(user_id, active=true)`, fans out to APNs/FCM HTTP v1 in parallel, deactivates invalid tokens. Mirror current behaviour from `index.ts:2058-2124`.
5. **Trigger replacement:** the current `sendPushOnNewAriaMessage` Firestore trigger has no direct Cloudflare equivalent. Options: (a) the Worker that writes the Aria message ALSO calls `sendPushToUser` inline; (b) emit a Cloudflare Queue message and a consumer Worker handles fan-out. Option (a) is simpler — adopt unless throughput needs decouple later.
6. **Client SDK swap:** `firebase_messaging` still works for receiving (iOS APNs delivery, Android via Google Play Services) — there's no replacement for the receive-side SDK. Replace it with `flutter_local_notifications` + platform-native push token retrieval (`flutter_apns_only` on iOS, `firebase_messaging` retained for FCM token on Android — Android push reception still requires Google Play Services + FCM transport whether or not Firebase backend is used). Reality: Android push reception cannot escape FCM. Plan accordingly.
7. **Re-registration:** all existing tokens are bound to the old Firebase project's APNs/FCM project IDs. On first run after cutover, `notification_service.dart` must re-request and re-register a token against the new project. Treat this as a one-time forced re-registration on app update.

---

## 4. Risks + mitigations

| Risk | Mitigation |
|---|---|
| **Crash blind spot during cutover** | Dual-write for 1 week (Sentry + Crashlytics both active). Compare event counts before retiring Crashlytics. |
| **Push token re-registration churn** | On post-cutover app update, force `getToken()` regardless of cached value. Log re-registration count to PostHog for visibility. Expect 100% token rotation. |
| **Lost notification history** | None today (FCM doesn't persist sends). No-op risk. |
| **Android receive-side still depends on FCM** | Accept it. "Off Firebase" doesn't mean "off FCM transport for Android." The Firebase Functions billing exit is what matters; the FCM transport itself is free. Server-side admin SDK gets replaced; client transport stays. |
| **App Check abuse window** | Acceptable short-term — App Check isn't enforced today anyway. Schedule the Worker-attestation work as a follow-up sprint. |
| **APNs `.p8` key management** | Store as Worker secret via `wrangler secret put APNS_AUTH_KEY`. Rotate annually. Never commit. |
| **Analytics history** | None worth preserving. Start fresh on PostHog. |

---

## 5. Effort estimate (solo dev)

| Service | Days |
|---|---|
| Crashlytics → Sentry | 0.5 |
| Analytics → PostHog | 0.5–1 (0 if deferred) |
| App Check → Worker attestation | 0 short-term, 1 in follow-up |
| FCM → Worker-direct APNs/FCM HTTP v1 | 3–4 |
| **Total** | **4–5.5 days** (worst case ~1.5 weeks with buffer) |

Most of the effort is in FCM (the trigger replacement + APNs JWT signing + token re-registration handling). The other three are mechanical swaps.

---

## 6. Open questions for the owner

1. **Analytics: migrate now or defer?** Currently only `session_start` fires. Either move to PostHog or remove `firebase_analytics` entirely and re-add an analytics provider once product decisions actually need data.
2. **App Check: short-term parity or proper attestation?** Today's setup is configured but not enforced. Recommendation is parity at cutover + follow-up sprint for Play Integrity + App Attest verification in Workers.
3. **Push fan-out shape:** inline-from-write-Worker (simpler) or Cloudflare Queues (decoupled, retries, better at scale)? Suggest inline unless conversation volume justifies the queue.
4. **OneSignal as an escape valve?** If APNs JWT signing + FCM HTTP v1 OAuth become a Worker time-sink, OneSignal's $0 tier covers ≤10K subs and unblocks. Acceptable tradeoff?
5. **Re-registration UX:** silent or surfaced? Users will see one extra "Allow notifications" prompt on first launch post-cutover if iOS auth was revoked. Tolerable or worth a paragraph in the release notes?
