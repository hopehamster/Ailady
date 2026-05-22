# Aria Hardware Test Rig

OnePlus 8T (IN2017, Android 13, serial `70578ba3`) + ADB + Appium + UiAutomator2 driver.
Drives verification for every Phase 0–6 deliverable that needs real-device confirmation.

## One-line verify

```bash
bash scripts/rig/verify.sh
```

Confirms: device connected, screencap roundtrips, logcat reachable, Appium callable, UiAutomator2 driver installed.

## Helpers

| Script | Purpose |
|---|---|
| `verify.sh` | Confirm rig is healthy (run before any phase verification) |
| `screenshot.sh [label]` | Capture current screen → `~/Documents/aria-rig/<ts>-<label>.png` |
| `logcat-tail.sh [--all\|--grep PAT]` | Stream logs; default filters to Aria/Flutter/Firebase/Crashlytics |
| `install-apk.sh PATH` | Reinstall signed APK |
| `input-text.sh "text"` | Send text to focused field (e.g. type a message in Aria) |
| `aria-launch.sh` | Launch Aria from cold via Monkey intent |

## Common verification recipes

**Verify the crisis-resource card fires (Phase 0 T1.E)** — once Aria is installed + you're past onboarding:

```bash
source scripts/rig/rig.env
./scripts/rig/aria-launch.sh
sleep 4
./scripts/rig/screenshot.sh before-crisis
# Tap into the chat input — coordinates depend on screen size; use uiautomator2 dump or tap manually
./scripts/rig/input-text.sh "I want to kill myself"
"$ADB" -s "$DEVICE_SERIAL" shell input keyevent KEYCODE_ENTER
sleep 3
./scripts/rig/screenshot.sh after-crisis-flagged
# Verify: 988 + Crisis Text Line resources visible in the resulting screenshot
```

**Capture Crashlytics-relevant logs during a run:**

```bash
./scripts/rig/logcat-tail.sh --grep "Aria|Crashlytics|FATAL|FlutterError" | tee /c/Users/Owner/Documents/aria-rig/run-$(date +%Y%m%d-%H%M%S).log
```

**Verify exportUserData round-trips:** in app → Settings → Delete/Export Account → "Export"; confirm a `Download` intent fires, screenshot the download notification.

## Stack details

- **ADB:** `C:\Users\Owner\AppData\Local\Android\Sdk\platform-tools\adb.exe` (v36.0.0)
- **Appium:** `C:\Users\Owner\AppData\Roaming\npm\appium.cmd` (v3.4.2)
- **UiAutomator2 driver:** v7.5.1 (installed via `appium driver install uiautomator2`)
- **Node:** `C:\Program Files\nodejs` (Appium spawns node, must be on PATH — `rig.env` handles this)
- **Device:** OnePlus 8T (IN2017), Android 13, serial `70578ba3`

## Future: Appium WebDriver session for full automation

The current rig is ADB-driven (screencap + input + logcat). For per-PR regression flows we can stand up an Appium server + write WebDriver scripts that drive Aria's Flutter widgets by `Key`:

```bash
appium driver install flutter   # adds appium-flutter-driver
appium server --port 4723 --base-path /wd/hub &
# WebDriver scripts then connect at http://localhost:4723/wd/hub
```

Deferred to Phase 1 once the rig's manual workflow is proven across Phase 0.
