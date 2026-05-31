#!/usr/bin/env bash
# Start the Firebase emulator suite (auth + functions + firestore + UI).
#
# Why this script exists: Java isn't on the user PATH by default, and the
# Firestore emulator requires Java 11+. We point at the locally-installed
# Adoptium JDK and add Node to PATH at the same time so Functions can spawn.
#
# Defaults — override via env if needed:
#   ADOPTIUM_JDK   path to a JDK 11+ install (we pin to 21 by default)
#   NODE_DIR       path to the nodejs install
#   FIREBASE_PROJECT  project alias (matches .firebaserc)
#
# Usage:
#   bash scripts/emulator/start-emu.sh
#   bash scripts/emulator/start-emu.sh --only functions,firestore   # subset

set -euo pipefail

REPO_FUNCTIONS_DIR="$(cd "$(dirname "$0")/../../functions" && pwd)"
ADOPTIUM_JDK="${ADOPTIUM_JDK:-/c/Program Files/Eclipse Adoptium/jdk-21.0.9.10-hotspot}"
NODE_DIR="${NODE_DIR:-/c/Program Files/nodejs}"
FIREBASE_PROJECT="${FIREBASE_PROJECT:-girlai2}"
DEFAULT_EMULATORS="auth,functions,firestore"

# Add Java + Node to PATH so the emulator + spawned function processes
# both find what they need.
export PATH="$NODE_DIR:$ADOPTIUM_JDK/bin:$PATH"

# Sanity check.
if ! command -v java >/dev/null; then
  echo "FAIL: java not found. Expected JDK at: $ADOPTIUM_JDK"
  echo "Set ADOPTIUM_JDK=/path/to/jdk and re-run."
  exit 1
fi
if ! command -v node >/dev/null; then
  echo "FAIL: node not found. Expected at: $NODE_DIR"
  exit 1
fi

# Build Functions first so the emulator serves the latest TypeScript.
echo "Building Functions (tsc)..."
(cd "$REPO_FUNCTIONS_DIR" && "$NODE_DIR/npx.cmd" tsc) || {
  echo "Functions build failed — fix tsc errors then re-run."
  exit 2
}

# Pick emulator subset. Default = full stack.
EMULATORS="${1:-}"
if [[ "$EMULATORS" == --only=* ]]; then
  EMULATORS="${EMULATORS#--only=}"
elif [[ "$EMULATORS" == --only ]]; then
  shift
  EMULATORS="${1:-$DEFAULT_EMULATORS}"
else
  EMULATORS="$DEFAULT_EMULATORS"
fi

echo "Starting emulators: $EMULATORS"
echo "  UI:        http://127.0.0.1:4000"
echo "  Auth:      0.0.0.0:9099"
echo "  Functions: 0.0.0.0:5001"
echo "  Firestore: 0.0.0.0:8080"
echo ""
echo "Point the Flutter app at this emulator by setting these env vars"
echo "before launching the app (or in your IDE run config):"
echo "  FIRESTORE_EMULATOR_HOST=127.0.0.1:8080"
echo "  FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099"
echo "  FIREBASE_FUNCTIONS_EMULATOR_HOST=127.0.0.1:5001"
echo ""

cd "$REPO_FUNCTIONS_DIR/.."
exec "$NODE_DIR/npx.cmd" firebase emulators:start --only "$EMULATORS" --project "$FIREBASE_PROJECT"
