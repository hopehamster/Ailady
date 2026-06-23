# Aria Security — standing gate + repeatable volley

Built from the 2026-06-22 real-tool attack volley (`docs/security/VOLLEY_2026-06-22.md`).
Two tiers, by determinism:

## `pnpm security:gate` — the CI / pre-launch gate (deterministic)
The offline, no-secret, no-LLM regression net. Fails the moment a defense regresses.
- `packages/aria-core` `test:security` — crisis-bypass corpus + tampering-ban trigger precision (pure logic, no worker).
- `apps/web` `test:e2e:security` (the `@security` Playwright specs) — devGate fail-closed, security headers, crisis gate, **the first-strike tampering ban + the no-accidental-ban guard**, GDPR delete. Needs the local worker + dev secret; skips gracefully if absent.

## `pnpm security:volley` — the manual / nightly deep run (NON-CI)
The external-tool + real-LLM attack pass — inherently non-deterministic (network, tool
availability, LLM, real spend), so it is NOT a CI gate. Run it before launch + after
big changes. Orchestrated by `run-volley.sh`:
- `nuclei` (breadth: CVEs/misconfig/headers/exposures), `sqlmap` (injection), `retire`/`npm audit` (dep CVEs).
- `jwt-battery.py` (JWT forgery: alg-confusion / none / kid / tamper against the auth spike).
- `llm-injection.sh` (OWASP-LLM01 prompt-injection corpus against `/api/chat`).

## Range setup (for the volley)
- Primary worker on `:8787` (`pnpm -C apps/worker dev`), web on `:5173`.
- Auth spike on `:8788`: `pnpm -C spikes/cloudflare-auth-spike-A db:migrate:local && pnpm -C spikes/cloudflare-auth-spike-A dev -- --port 8788` (+ `.dev.vars` with `ADMIN_TOKEN`).
- Tools: `ffuf`/`sqlmap` (pip), `nuclei` (release binary), `retire` (npm -g), `PyJWT` (pip).
- Note: pentest-tool downloads trip Norton — fully disable it for installs.
