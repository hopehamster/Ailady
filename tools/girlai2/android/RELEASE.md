# Android Release Build

## One-time setup: generate the upload key

The release signing config reads from `android/key.properties` (gitignored).
You must generate a keystore before the first store-listing build.

### Step 1 — Generate keystore

From the `tools/girlai2/android` directory:

```bash
keytool -genkey -v -keystore upload-keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 -alias upload
```

You'll be prompted for:
- Keystore password (save in 1Password / your secret manager — losing it bricks future updates)
- Key password (can be the same as keystore password)
- Distinguished name fields (use real values; they'll appear in the cert)

The file `upload-keystore.jks` will be created in `tools/girlai2/android/`. It is gitignored.

**BACK IT UP** to a separate location. If you lose this file, you cannot push updates to the Play Store under this app entry — you'd have to publish a new app entry.

### Step 2 — Create `key.properties`

Create `tools/girlai2/android/key.properties` with:

```properties
storeFile=upload-keystore.jks
storePassword=<your keystore password>
keyAlias=upload
keyPassword=<your key password>
```

This file is gitignored. Do not commit.

### Step 3 — Build release APK

```bash
cd tools/girlai2
flutter build apk --release
```

Output: `tools/girlai2/build/app/outputs/flutter-apk/app-release.apk`

For Play Store upload (recommended): `flutter build appbundle --release` → `app-release.aab`.

## Behavior when key.properties is missing

If `key.properties` is absent or incomplete, the release build falls back to
the **debug keystore** so `flutter run --release` works for local profiling.
Builds intended for the Play Store MUST have `key.properties` present.

The fallback is intentional — it lets you run release-mode builds locally
without forcing every developer to have signing material.

## Crashlytics

Crashlytics is enabled in release builds via the `com.google.firebase.crashlytics`
Gradle plugin (configured in `android/settings.gradle.kts` and `app/build.gradle.kts`).
Mapping files (NDK + R8) upload automatically when the release task runs.

In debug builds Crashlytics collection is disabled by `main.dart`'s
`setCrashlyticsCollectionEnabled(!kDebugMode)` call to keep the dashboard clean
of dev iteration noise.
