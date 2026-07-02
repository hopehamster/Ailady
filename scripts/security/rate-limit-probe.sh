#!/usr/bin/env bash
# Rate-limit + bounded-input probe for the PRIMARY worker (issue #9; volley F4).
# Design: docs/security/RATE_LIMITS_DESIGN_2026-07-01.md §6.
#
# Modes (auto-detected from live behavior):
#   - Dev, no bindings (today):  asserts the gates are INERT (no spurious 429/503)
#                                and the safe-now input bounds hold (400/413s).
#   - Post-#13, bindings live:   asserts per-uid burst 429 with retry-after and a
#                                leak-free 429 body.
#   - Prod-mode misconfig:       run with EXPECT=closed against an ENV!=dev worker
#                                without bindings — asserts private endpoints 503.
#
# Env: WORKER (default http://127.0.0.1:8787), SECRET (dev shared secret; required
# except EXPECT=closed), EXPECT=inert|limited|closed (default inert).
set -u
W="${WORKER:-http://127.0.0.1:8787}"
EXPECT="${EXPECT:-inert}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$@"; }

echo "=== primary-worker rate-limit probe ($EXPECT) $(date -u +%FT%TZ) ==="

if [ "$EXPECT" = "closed" ]; then
  # Prod-mode misconfig regression: ENV!=dev + no bindings must FAIL CLOSED.
  # rateLimitGate runs before devGate, so the expected code is 503
  # (rate_limit_unconfigured), never 200 and never an open endpoint.
  for ep in /api/chat /api/tts /api/avatar/session /api/account/delete; do
    c=$(code -X POST "$W$ep" -H 'content-type: application/json' -d '{}')
    case "$c" in
      503|401) ok "$ep closed ($c)";;
      *) bad "$ep returned $c — production path is NOT failing closed";;
    esac
  done
  echo "=== probe done: $PASS pass / $FAIL fail ==="; exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
fi

S="${SECRET:?set SECRET to the worker DEV_SHARED_SECRET}"
H=(-H "content-type: application/json" -H "x-dev-secret: $S")
UID_H="rl-probe-$$"

echo "--- safe-now bounded inputs ---"
c=$(code -X POST "$W/api/chat" "${H[@]}" -H "x-dev-uid: $UID_H" \
  -d "{\"message\":\"$(printf 'a%.0s' $(seq 1 4001))\"}")
[ "$c" = "413" ] && ok ">4000-char message -> 413" || bad ">4000-char message -> $c (want 413)"

LONG_UID=$(printf 'u%.0s' $(seq 1 200))
c=$(code -X POST "$W/api/chat" "${H[@]}" -H "x-dev-uid: $LONG_UID" -d '{"message":"hi"}')
[ "$c" = "400" ] && ok ">128-char x-dev-uid -> 400" || bad ">128-char x-dev-uid -> $c (want 400)"

c=$(code -X POST "$W/api/chat" "${H[@]}" -H "x-dev-uid: $UID_H" \
  -H "content-length: 70000" -d '{"message":"hi"}')
[ "$c" = "413" ] && ok ">64KB declared body -> 413" || bad ">64KB declared body -> $c (want 413)"

echo "--- burst behavior (12 x /api/tts, same uid; tts avoids real LLM spend) ---"
LAST=""; GOT429=0; GOT503=0
for i in $(seq 1 12); do
  LAST=$(code -X POST "$W/api/tts" "${H[@]}" -H "x-dev-uid: $UID_H" -d '{"text":"probe"}')
  [ "$LAST" = "429" ] && GOT429=1
  [ "$LAST" = "503" ] && GOT503=1   # tts_not_configured is fine in dev; NOT a limit
done
if [ "$EXPECT" = "limited" ]; then
  # Post-#13: expect the uid burst limit to trip.
  if [ "$GOT429" = "1" ]; then
    RA=$(curl -s -D - -o /dev/null -X POST "$W/api/tts" "${H[@]}" -H "x-dev-uid: $UID_H" \
      -d '{"text":"probe"}' | grep -i '^retry-after:' | head -1)
    [ -n "$RA" ] && ok "burst -> 429 with $RA" || bad "429 present but no retry-after header"
    BODY=$(curl -s -X POST "$W/api/tts" "${H[@]}" -H "x-dev-uid: $UID_H" -d '{"text":"probe"}')
    echo "$BODY" | grep -q '"rate_limited"' && ok "429 body is generic" || bad "429 body leaks: $BODY"
  else
    bad "bindings expected LIVE but 12-burst never returned 429 (last=$LAST)"
  fi
else
  # Today: gates must be INERT — no 429 ever while bindings are absent.
  [ "$GOT429" = "0" ] && ok "no 429 in dev burst (gates inert as designed)" \
                      || bad "got 429 in dev with no bindings configured — gate not inert"
fi

echo "=== probe done: $PASS pass / $FAIL fail ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
