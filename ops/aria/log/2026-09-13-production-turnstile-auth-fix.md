# 2026-09-13 Production Turnstile Auth Fix

## Problem
- Owner attempted production login at `https://aria-worker.mikebradley1980.workers.dev`.
- Browser showed the generic sign-in copy: `Something got tangled during sign-in. Try once more?`
- Production D1 audit showed the real cause:
  - `otp_send_turnstile_failed`
  - `metadata_json={"hadToken":false}`

## Root Cause
- The production web bundle had been built without `VITE_TURNSTILE_SITEKEY`.
- `Turnstile.tsx` intentionally renders nothing when the public site key is absent.
- The Worker correctly failed closed before Twilio SMS, so this was frontend build-time config, not an HF endpoint issue and not a Twilio-send failure.

## Fix
- Located the Cloudflare Turnstile widget via Cloudflare API:
  - Name: `Aria Sign-in`
  - Domain: `aria-worker.mikebradley1980.workers.dev`
  - Mode: `managed`
- Added `apps/web/.env.production` with the public Turnstile site key.
- Added `apps/web` script `build:prod` as an explicit production build path.
- Rebuilt and redeployed production Worker assets.

## Verification
- `pnpm -C apps/web build` passed with production site key present.
- Deployed Worker version: `30dd0cc3-6eb4-4563-a79c-9d149ec404ef`.
- Live bundle verification:
  - JS asset: `/assets/index-DgbFGNf0.js`
  - Contains production Turnstile site key: yes
  - Contains Turnstile script URL: yes
- No-token API verification still fails closed:
  - `POST /v1/auth/otp/send` without Turnstile token returned `403 turnstile_failed`
  - `Cache-Control: no-store`
- HF endpoint remained paused:
  - `aria-qwen38-v05-merged-smoke`
  - `status=paused`
  - `readyReplica=0`

## Next
- Owner should refresh the production page and retry login.
- If OTP send still fails, inspect `audit_events` again; the next likely branch would be Twilio vendor response, not missing Turnstile.
