---
type: session
issue: "#35 + #42"
created: 2026-07-06
---
# soul-v11-harvest-m0-twilio — v2-inspiration docs harvested into the design of record; M0 deploy build opened + Twilio vendor shipped

- **Goal:** (a) Execute the owner-authorized first deploy — surfaced that the prod web↔worker integration was never built (mock adapter + dev-secret + Vite proxy only); plan for the FULL WORKING APP approved after 3 consecutive clean review passes → **#42 opened**. (b) Owner supplied three external psyche design docs ("use these as inspiration to enhance what we have") → **v1.1 HARVEST** into `soul-architecture.md`.

- **Work done (repo):**
  1. **#42 slice 1 SHIPPED (`1820feb`):** `TwilioVerifyVendor` (Verify v2: send → `VE…` sid; VerificationCheck by `VerificationSid` — vendor never re-sees the phone; form-encoded; 404→expired mapping) + fail-closed `getVendor` twilio branch; `TWILIO_ACCOUNT_SID/AUTH_TOKEN/VERIFY_SERVICE_SID` in `AuthEnv`; prod toml → `OTP_VENDOR="twilio"` + real D1 id; `session.ts` + optional `refreshToken`/`expiresAtMs`.
  2. **Provisioned (owner accounts, reversible):** Twilio Verify Service `VAdc4fa69910019468b65e9e884c46454f`; D1 `aria-prod` (`2eb1f9d9-16f7-4e97-8633-1d398a92a255`) with all 5 migrations `--remote`; `PHONE_HASH_SALT`+`ADMIN_TOKEN` → gitignored `.dev.vars.prod`.
  3. **SOUL v1.1 HARVEST (#35):** three v1 docs versioned at `ops/aria/protocols/soul-v2-inspiration/`; `soul-architecture.md` gains the harvest section — **E1 earned-weight economy** (recognition starves on cheap approval; sycophancy non-nutritive; I9), **E2 three-A's substructure** (accepted-after-disagreement ×2), **E3 reciprocity ledger** (bond-vitality arithmetic; being-let-in=receiving; voiced-need never withdrawal; I11), **E4 two-layer identity** (immutable CORE repo-global / CHARACTER per-uid D1, anchor-only writes, drift checks; I10), **E5 continuity anchors + reconstitution ritual** (sparse event-driven first-person anchors off-path; genesis anchor; boot assembly). **REJECTED with reasons:** 7-LLM committee (pure-core principle), idle heartbeat (stateless runtime + reconstituted-on-return canon), 4-drive swap (6 are GO-gated), warmth-withdrawal (companion never).

- **Files changed:** `apps/worker/src/{auth_vendor,auth}.ts`, `apps/worker/wrangler.production.toml`, `apps/web/src/shell/auth/session.ts` (commit `1820feb`, #42) · `ops/aria/protocols/soul-architecture.md`, `ops/aria/protocols/soul-v2-inspiration/*` (3 files), this log + index (#35 checkpoint).

- **Commands + evidence:** Twilio vendor: 16/16 fetch-mocked assertions (endpoints, Basic auth, form-encoding, sid-keyed verify, all failure paths) · worker `tsc` clean ×2 · web `tsc` clean · `pnpm security:gate` 8/8 (auth touched) · migrations 5/5 remote · evidence comments on [#35](https://github.com/hopehamster/Ailady_clean_20260327/issues/35) + issue body [#42](https://github.com/hopehamster/Ailady_clean_20260327/issues/42).

- **Decisions:** Twilio over Plivo (only vendor with live creds); single-origin worker-serves-SPA architecture (kills CORS/CSP churn — client calls are relative); harvest-not-replace for the v2 docs (spine holds: pure core, 6 drives, LLM-at-render, safety absolute); ledger inputs product-safe; **NEW standing owner gate: H3 identity-core content sign-off** (prime values + genesis anchor draft in-doc) alongside the B2 consensus gate.

- **Open items:** #42 remaining = auth spine rewrite (session-based adapter + SignIn + Turnstile prod-only) → apiFetch (Bearer + single-flight refresh) → single-origin `[assets]` → deploy sequence (origin→widget→build→preflight→deploy→secrets→smoke) → authed-loop verify (owner: 1 phone + 1 code read). Deploy is owner-authorized; go signal pending.

- **Next issue:** #42 (the M0 build is the active slice).
