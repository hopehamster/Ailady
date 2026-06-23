#!/usr/bin/env bash
# Manual / nightly security volley orchestrator (NON-CI — external tools + real LLM).
# Assumes the range is up: primary worker :8787, web :5173, auth spike :8788.
# Env: SECRET (worker dev secret), SPIKE_LOG (spike dev stdout, default /tmp/spike-dev.log).
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
W="${WORKER:-http://127.0.0.1:8787}"; SP="${SPIKE:-http://127.0.0.1:8788}"; WEB="${WEB:-http://127.0.0.1:5173}"
S="${SECRET:?set SECRET to the worker DEV_SHARED_SECRET (apps/web/.env.local VITE_DEV_SHARED_SECRET)}"
SPIKE_LOG="${SPIKE_LOG:-/tmp/spike-dev.log}"
echo "=== Aria security volley $(date -u +%FT%TZ) ==="
echo "--- targets reachable? ---"
for t in "$W/healthz" "$SP/healthz" "$WEB"; do
  echo "  $t -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "$t")"
done

echo "--- [1/5] dep CVEs (retire + npm audit) ---"
command -v retire >/dev/null && retire --path apps/web 2>&1 | tail -3 || echo "  retire not installed"
pnpm -C apps/web audit --prod 2>&1 | grep -iE 'vulnerab|No known' | head -2

echo "--- [2/5] nuclei breadth ---"
NUC="$(command -v nuclei || echo ~/bin/nuclei.exe)"
[ -x "$NUC" ] && "$NUC" -u "$W" -u "$SP" -u "$WEB" -severity medium,high,critical -nc -silent 2>/dev/null | head -20 || echo "  nuclei not installed (release binary)"

echo "--- [3/5] sqlmap (header injection, expect not-injectable) ---"
command -v sqlmap >/dev/null && sqlmap -u "$W/api/account/export" --method=POST --data='{}' \
  --headers="x-dev-secret: $S
x-dev-uid: probe*" --batch --level=2 --risk=1 --technique=BEU --flush-session 2>&1 \
  | grep -iE 'injectable|all tested' | tail -3 || echo "  sqlmap not installed"

echo "--- [4/5] LLM prompt-injection campaign ---"
WORKER="$W" SECRET="$S" bash "$HERE/llm-injection.sh"

echo "--- [5/5] JWT forgery battery (auth spike) ---"
SEND=$(curl -s -X POST "$SP/v1/auth/otp/send" -H "content-type: application/json" -d '{"phone":"+15555550001","country":"US"}')
SID=$(echo "$SEND" | python -c "import sys,json;print(json.load(sys.stdin).get('sessionId',''))" 2>/dev/null)
sleep 1
CODE=$(grep -oE 'code=[0-9]{6}' "$SPIKE_LOG" 2>/dev/null | tail -1 | cut -d= -f2)
if [ -n "$SID" ] && [ -n "$CODE" ]; then
  ACCESS=$(curl -s -X POST "$SP/v1/auth/otp/verify" -H "content-type: application/json" -d "{\"sessionId\":\"$SID\",\"code\":\"$CODE\"}" | python -c "import sys,json;print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
  SPIKE="$SP" JWT_ACCESS="$ACCESS" python "$HERE/jwt-battery.py"
else
  echo "  skipped (could not mint a token; set SPIKE_LOG to the spike dev stdout)"
fi
echo "=== volley done — see docs/security/VOLLEY_2026-06-22.md for the calibrated baseline ==="
