#!/usr/bin/env bash
# Post-deploy smoke (#26) — deterministic, unauthenticated checks against a
# deployed origin pair. Run after EVERY deploy; save output as release evidence.
#   scripts/release/smoke.sh https://api.example.com https://app.example.com
set -u
API="${1:?usage: smoke.sh <worker-origin> <web-origin>}"
WEB="${2:?usage: smoke.sh <worker-origin> <web-origin>}"
fails=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "  ok   $1 ($3)"; else echo "  FAIL $1 (want $2, got $3)"; fails=$((fails+1)); fi
}

echo "== worker: $API =="
check "healthz 200"        200 "$(curl -s -o /dev/null -w '%{http_code}' "$API/healthz")"
check "chat unauth 401"    401 "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/api/chat" -H 'content-type: application/json' -d '{"message":"hi"}')"
# CORS deny-by-default: an unlisted origin must get NO allow-origin header.
acao=$(curl -s -o /dev/null -D - -H "Origin: https://evil.example" "$API/healthz" | grep -ci "access-control-allow-origin" || true)
check "CORS deny unlisted" 0 "$acao"

echo "== web: $WEB =="
check "index 200"          200 "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")"
check "vendor engine 200"  200 "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/vendor/talkinghead/talkinghead.mjs")"
csp=$(curl -s -o /dev/null -D - "$WEB/" | grep -ci "content-security-policy" || true)
check "CSP header present" 1 "$csp"
# The strict policy must NOT allow the CDN anymore (#8).
cdn=$(curl -s -o /dev/null -D - "$WEB/" | grep -ci "cdn.jsdelivr.net" || true)
check "CSP has no CDN"     0 "$cdn"

echo ""
if [ "$fails" -gt 0 ]; then echo "✗ smoke FAILED ($fails)"; exit 1; fi
echo "✓ smoke passed"
