# Local Firebase Emulator — quick start

Run the Aria backend on your machine instead of GCP. No deploys needed,
no Cloud spend. Useful while billing is on hold or for fast iteration.

## What runs

| Service | Port | What |
|---|---|---|
| Auth | 9099 | Firebase Auth — local accounts, free |
| Functions | 5001 | All 34 Cloud Functions, hot-reloaded on file change |
| Firestore | 8080 | Local Firestore — empty by default; no production data |
| Emulator UI | 4000 | Web dashboard for inspecting state |

## Start

```bash
cd tools/girlai2
bash scripts/emulator/start-emu.sh
```

That's it. Java + Node PATH are wired by the script. First start takes ~30s
(downloads emulator jars on first run, then cached forever).

Subset (e.g., only functions + firestore, skip auth):
```bash
bash scripts/emulator/start-emu.sh --only functions,firestore
```

To stop: Ctrl+C in the emulator terminal.

## Point the Flutter app at the emulator

The Flutter app already has `lib/core/utils/emulator_config.dart` which
auto-detects via env vars. Before launching the app, set:

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001
flutter run
```

**Physical device gotcha:** the OnePlus rig can't reach `127.0.0.1` on
your laptop — that's localhost on the phone. Use your laptop's LAN IP
(`ipconfig` to find it), and the host must be `0.0.0.0` in
firebase.json (already set). Then:

```bash
export FIRESTORE_EMULATOR_HOST=192.168.x.x:8080
# etc.
```

## What still costs money

Even with the emulator running locally, the **LLM API calls** (OpenAI,
Anthropic, Gemini) still hit real provider APIs and cost real tokens.
The emulator runs YOUR code locally; the LLM calls go out to the
provider as normal. Use cheap models (Haiku / Flash / 4o-mini) during
emulator testing if you want zero LLM spend.

Cloud Storage (voice MP3 bucket) is NOT emulated by default — Aria's
voice path will try to upload to the real `girlai2-voice-audio` bucket.
If you don't want that, either stub the bucket env var or run with
`--only auth,functions,firestore` and skip voice testing locally.

## Data persistence between runs

By default, Firestore emulator data is wiped on shutdown. To keep test
data across runs:

```bash
bash scripts/emulator/start-emu.sh --only auth,functions,firestore -- --import=./emulator-data --export-on-exit=./emulator-data
```

(The double `--` separates script args from emulator passthrough args.)

## Troubleshooting

**"java not found":** the script expects Adoptium JDK at
`C:\Program Files\Eclipse Adoptium\jdk-21.0.9.10-hotspot`. Pass
`ADOPTIUM_JDK=/path/to/your/jdk` if yours is elsewhere.

**Port already in use:** stale process. Kill it:
```bash
# Find which port
netstat -ano | grep LISTENING | grep ':5001'
# Kill by PID from the last column
taskkill /PID <pid> /F
```

**Functions emulator can't see latest code:** the script runs `tsc`
before starting. If you edited TS after starting, the watcher should
hot-reload, but if it doesn't, restart the emulator.

**Logs piling up:** they're in `firestore-debug.log`, `firebase-debug.log`,
`ui-debug.log` in the project root. Safe to delete between runs.
