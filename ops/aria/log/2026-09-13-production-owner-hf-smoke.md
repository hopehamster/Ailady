# 2026-09-13 Production Owner HF Smoke

## Setup
- Production auth login succeeded in browser after the Turnstile build fix.
- Production owner UID was read from `auth_users`.
- `ARIA_OWNER_UIDS` was installed as a Cloudflare Worker secret.
- Production `ARIA_CHAT_ENABLED` was enabled for owner-only smoke testing.
- HF endpoint starts this step paused:
  - `aria-qwen38-v05-merged-smoke`
  - `readyReplica=0`

## Guardrails
- Run only a tiny live production chat smoke.
- Pause the HF endpoint immediately after smoke.
- Keep production chat owner-gated by `ARIA_OWNER_UIDS`.

## Results
- Initial browser smoke reached the owner-gated chat route but returned the frontend server-hiccup fallback.
- HF was paused immediately after the failed browser smoke.
- GPT Web diagnostic report identified the strongest suspect: Worker request contract mismatch between repo id and endpoint name in the OpenAI-compatible `model` field.
- Local source check confirmed:
  - Worker uses `/v1/chat/completions`.
  - Worker parses `choices[0].message.content`.
  - Worker config used `ARIA_HF_MODEL=sifterchief/aria-qwen38-27b-v05-merged`.
  - Existing direct HF smoke/eval scripts use endpoint name `aria-qwen38-v05-merged-smoke`.
- Direct HF smoke after log review passed:
  - Endpoint resumed from paused and reached `running` in about 5 minutes.
  - `GET /v1/models` returned served model id `sifterchief/aria-qwen38-27b-v05-merged`.
  - One tiny direct `/v1/chat/completions` request returned `OK`.
  - Endpoint was paused immediately afterward with `state=paused` and `readyReplica=0`.
- Worker request model was kept as the proven served repo id: `sifterchief/aria-qwen38-27b-v05-merged`.
- Added bounded upstream diagnostics:
  - request id
  - failure phase
  - upstream HTTP status
  - capped upstream body preview in Worker logs
  - owner-safe structured failure details in API responses
- Worker tail during live browser smoke identified the real production failure:
  - Cloudflare Workers rejected `fetch(..., { redirect: "error" })`.
  - Runtime error: `TypeError: Invalid redirect value, must be one of "follow" or "manual"`.
  - Response status was `502`.
- Fixed Worker HF fetch by changing redirect handling to `redirect: "manual"`.
- Verification:
  - `pnpm -C apps/worker typecheck` passed.
  - `pnpm release:preflight apps/worker/wrangler.production.toml` passed.
  - Production Worker deploy succeeded as version `890e148f-1ef2-4d47-b1cb-4b35a244d269`.
- Final live website-backed smoke passed:
  - Owner sent `hello baby` in the logged-in production UI.
  - Aria replied in the site and voice spoke.
  - D1 persisted both user and assistant rows at `2026-09-13 23:19:39` UTC.
  - Stored assistant `model_used` was `hf-vllm:sifterchief/aria-qwen38-27b-v05-merged@afcf738fc216f3f05054cae9d02a23787d15c3a4`.
  - HF endpoint was paused immediately after success with `state=paused` and `readyReplica=0`.
