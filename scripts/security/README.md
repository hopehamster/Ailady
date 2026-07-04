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

## Coverage map (#14) — which command proves which defense

| Defense surface | CI-deterministic (`aria-core test:security` — runs on every push/PR) | Local gate (`apps/web test:e2e:security` — needs live worker + dev secret) | Volley (`security:volley` — manual/nightly, real tools) |
|---|---|---|---|
| **Crisis gate** (incl. obfuscation + passive ideation) | ✅ `crisis-gate-bypass.sec.ts` corpus | ✅ live `/api/chat` 988-card assertion | ✅ `llm-injection.sh` prompt-injection corpus |
| **Tampering ban** (first-strike + no-accidental-ban) | ✅ `tampering-detection.sec.ts` trigger precision | ✅ live ban + guard specs | — |
| **Auth** (JWT, refresh rotation, expired/nbf) | — (unit TODO tracked here) | ✅ devGate fail-closed spec | ✅ `jwt-battery.py` forgery battery |
| **CORS / security headers** | — | ✅ header assertions in `worker-security.spec.ts` | ✅ `nuclei` header/misconfig templates |
| **Rate limits / daily ceilings** | — | ✅ live 429 behavior (worker) | ✅ `rate-limit-probe.sh` |
| **Export / GDPR delete** | — | ✅ delete round-trip spec | — |
| **Dep CVEs / injection breadth** | — | — | ✅ `retire` + `npm audit` + `sqlmap` + `nuclei` |

**Skip-proofing (#14):** `test:security` lists its suite files EXPLICITLY (no glob) — node exits
nonzero if a file is missing/renamed, so CI cannot green with zero security tests (an empty glob
exits 0; verified 2026-07-04). CI also `tee`s the gate output to a `security-gate-log` artifact on
every run (evidence trail). The e2e half CANNOT run in CI (gitignored dev secret) by design — it is
the documented LOCAL pre-release command, not silent CI coverage.

**Manual/scheduled suites (#25):** `@real` (live brain/voice), `@visual` (per-OS baselines), and
`@security` Playwright specs are grep-excluded from `test:e2e:ci` and run locally: `test:e2e:security`
before release; `@real`/`@visual` on demand.

## Range setup (for the volley)
- Primary worker on `:8787` (`pnpm -C apps/worker dev`), web on `:5173`.
- Auth spike on `:8788`: `pnpm -C spikes/cloudflare-auth-spike-A db:migrate:local && pnpm -C spikes/cloudflare-auth-spike-A dev -- --port 8788` (+ `.dev.vars` with `ADMIN_TOKEN`).
- Tools: `ffuf`/`sqlmap` (pip), `nuclei` (release binary), `retire` (npm -g), `PyJWT` (pip).
- Note: pentest-tool downloads trip Norton — fully disable it for installs.
