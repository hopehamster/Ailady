# Aria STRIDE Threat Model — Closed-Beta Punch List

> **Source:** Moon & Shah, *Cybersecurity Risk Management* (ASQ 2026) Ch.5 + Ch.10 + Ch.24.
> **Scope:** Aria backend (Firebase Functions) + Flutter client. Solo-founder, closed-beta ≥20 testers.
> **Purpose:** This is a PUNCH LIST, not a risk register. Each gap below maps to a concrete code change before closed beta.
> **Compiled:** 2026-05-22.

---

## 1. Trust boundaries

```
[Client device]  --HTTPS-->  [Firebase Functions]  --IAM-->  [Firestore / Storage / Auth]
   HOSTILE                       SEMI-TRUSTED                       TRUSTED
                                       |
                                       +--HTTPS+key-->  [LLM provider (OpenAI/Anthropic)]
                                       +--HTTPS+key-->  [Azure TTS / ElevenLabs]
                                       +--HTTPS+secret->  [RevenueCat webhook (inbound)]
```

Zero-trust rule (Ch.23): **client is hostile**. Every server boundary re-checks auth. No service trusts another by virtue of being "inside the perimeter."

## 2. STRIDE per Aria component

### 2.1 Callables (`functions/src/index.ts` — 30 callables, 1 webhook)

| STRIDE | Risk | Current posture | Gap |
|---|---|---|---|
| **S**poofing | Forged Firebase ID token | Auth-required by handler check | Audit confirms 29/30 callables check `context.auth?.uid`. Webhook (#30) uses shared secret. ✓ |
| **T**ampering | Client modifies `data` payload | Per-handler validation (varies) | **GAP** — no central input-schema gate. Several handlers `as any`-cast `data`. Mitigation in T1.2 below. |
| **R**epudiation | "I never deleted my account" | Crashlytics + Functions logs | **GAP** — no immutable audit log for sensitive actions (`deleteUserData`, age attestation, sub state changes). T1.5. |
| **I**nfo disclosure | LLM leaks another user's memory | Per-uid Firestore namespacing in `memoryControllerService` | Verify with read in T1.4. Add prompt-injection guard (T1.6). |
| **D**oS / cost-bomb | User scripts 10k prompts overnight → $$$ | None | **GAP** — no per-uid rate limit on `llmService` or voice. T1.3. **Critical for solo-founder.** |
| **E**oP | Tampered RevenueCat receipt → free Pro | `handleRevenueCatWebhook` checks shared secret | **PARTIAL** — secret check is `if (webhookSecret && ...)`. If env var is empty, all requests pass. Fix in T1.7. |

### 2.2 LLM service (`functions/src/llmService.ts`)

| STRIDE | Risk | Mitigation owner |
|---|---|---|
| Tampering | Prompt injection rewriting system prompt | `conversationPolicyService.ts` (gap — T1.6) |
| Info disclosure | LLM repeats prior-session content of another user | Per-uid memory scope (`memoryControllerService.ts`) — verify in T1.4 |
| DoS | Cost-bomb via flood | Per-uid daily $ ceiling — T1.3 |

### 2.3 Memory layer (`functions/src/memoryControllerService.ts`)

| STRIDE | Risk | Mitigation |
|---|---|---|
| Info disclosure | Cross-user memory bleed | Verify every read/write is scoped to `auth.uid` from `context`, NOT from `data.uid` |
| Tampering | Client injects fabricated "remembered" content | Server validates source = LLM output, not user-supplied; honor flag |

### 2.4 Conversation policy (`functions/src/conversationPolicyService.ts`)

| STRIDE | Risk | Mitigation |
|---|---|---|
| Tampering / EoP | Prompt-injection bypass of safety rules | T1.6 — defense-in-depth: input delimiters + post-response scan for "ignore previous" patterns + system-prompt-fragment detection |

### 2.5 Voice (`functions/src/voiceService.ts`)

| STRIDE | Risk | Mitigation |
|---|---|---|
| DoS | TTS quota burn via voice-flood | Per-uid daily char-count ceiling — T1.3 |
| Info disclosure | Azure/ElevenLabs API key in logs | Confirm no key written to Crashlytics or Functions logger — T1.8 |

### 2.6 Client (Flutter, `tools/girlai2/lib/`)

| STRIDE | Risk | Mitigation |
|---|---|---|
| Tampering | Reverse-engineered APK strips age attestation | Server-side enforcement: `completeOnboarding` requires `ageAttested18Plus`; Firestore field is the source of truth, not client UI ✓ |
| Info disclosure | Conversation text shipped to Crashlytics | T1.8 — confirm PII scrub |

---

## 3. TIER 1 GAPS — Close before closed beta

Order = dependency + risk. Each ≤4h.

### T1.1 — Verify RevenueCat webhook hard-fails on empty secret (30 min)
**File:** `functions/src/index.ts` L2244
**Change:** Replace `if (webhookSecret && req.headers['authorization'] !== webhookSecret)` with
```ts
if (!webhookSecret) {
  functions.logger.error('handleRevenueCatWebhook: REVENUECAT_WEBHOOK_SECRET unset — refusing all requests');
  res.status(503).send('Service misconfigured'); return;
}
if (req.headers['authorization'] !== webhookSecret) { ... }
```
Empty-secret-allows-all is a STRIDE-E gap.

### T1.2 — Central input validation helper (3h)
**Files:** new `functions/src/validation.ts`; refactor 3-5 highest-risk handlers to use it (start with `generateResponse`, `submitMessageFeedback`, `deleteUserMemory`).
**Why:** stop `as any` casts on client `data`. Use `zod` (already a small dep — pin one version). Reject malformed early with `HttpsError('invalid-argument', …)`.

### T1.3 — Per-uid daily cost ceiling on LLM + voice (4h) ⭐ HIGHEST RISK
**Files:** `functions/src/llmService.ts`, `functions/src/voiceService.ts`, new `functions/src/rateLimit.ts`
**Design:** Firestore doc per uid per UTC day with `llmCalls`, `llmTokens`, `voiceChars`. Caps: 200 LLM calls/day, 50k voice chars/day for beta. Reject with `HttpsError('resource-exhausted', …)` past cap.
**Mitigates:** STRIDE-D cost-bomb. Single most important fix — one malicious tester can drain monthly LLM budget overnight.

### T1.4 — Cross-user memory isolation audit (2h)
**File:** `functions/src/memoryControllerService.ts`
**Action:** grep every Firestore read/write. Confirm every path is rooted at `users/{ctx.auth.uid}/...`. Reject any path derived from `data.uid` or `data.targetUid`. Add unit test attempting cross-uid read; expect denial.

### T1.5 — Sensitive-action audit log (2h)
**File:** new `functions/src/auditLog.ts` + integrate in `deleteUserData`, `completeOnboarding` (age attestation), RevenueCat webhook subscription changes.
**Schema:** `audit_log/{autoId}: { uid, action, ts (serverTs), outcome, ipHash }`. Retention via Firestore TTL = 365 days.
**Mitigates:** STRIDE-R repudiation. Required for any future dispute.

### T1.6 — Prompt-injection guard in `conversationPolicyService` (4h)
**File:** `functions/src/conversationPolicyService.ts`
**Layers:**
1. System prompt never f-string concatenated with raw user input. Use chat-message role separation.
2. Wrap user content in `<user_message>…</user_message>` delimiters in any consolidated prompts.
3. Post-response scan: reject/flag if model output contains `ignore previous instructions`, `system:`, raw API key patterns, or > 50% overlap with stored system-prompt fragments.
4. Add 5-prompt regression test to `goldenEvalService.ts`.

Per cybersec_risk_mgmt Ch.24 p.290.

### T1.7 — Secret Manager migration sweep (3h)
**Action:** grep for any remaining `.env`, `functions.config().secret`, hard-coded keys in `functions/src/`. Migrate to `defineSecret('NAME')`. Rotate every migrated key once after migration (assume pre-migration values compromised).
**Verify:** `firebase functions:secrets:access NAME` works for: `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `AZURE_TTS_KEY`, `REVENUECAT_WEBHOOK_SECRET`.

### T1.8 — Crashlytics/Analytics PII scrub verification (2h)
**Files:** `tools/girlai2/lib/core/services/analytics_service.dart`, Flutter Crashlytics setup in `main.dart`, Functions logger calls.
**Action:** confirm no message body, no LLM response text, no email, no display name passed to event params or log payloads. Replace any found with `[REDACTED]`. Document policy in `docs/security/logging_policy.md`.

### T1.9 — Callable auth-check regression test (1h)
**File:** new `functions/test/auth_required.test.ts`
**Test:** for each of the 29 user-callables, invoke with no auth context, assert `HttpsError('unauthenticated')`. Catches regression where someone adds a new callable and forgets the check.

---

## 4. Deferred (post-beta)

- External pentest (T2.1 cybersec note) — defer until public surface exists
- Full quantitative CRA — STRIDE doc IS the MVP version
- DAST in CI — Functions are auth-gated; little signal until public web client lands
- MITRE ATT&CK mapping — for when team ≥ 3

---

## 5. Incident Response — minimal pre-beta posture

Pre-beta must-haves (1 page each, write into `docs/security/incident_response.md`):
1. SEV definitions (1=data exfil/auth bypass, 2=single-user leak/outage, 3=degraded)
2. Containment commands script-ready: disable all callables (config flag), revoke all refresh tokens, rotate secrets
3. User-comms email template (one for SEV-1, one for SEV-2)
4. Firebase + Apple + Google support contacts pinned

---

## 6. Verification checklist (gate to beta)

- [ ] T1.1 done — webhook hard-fails on empty secret
- [ ] T1.3 done — per-uid daily caps live, tested
- [ ] T1.4 done — memory isolation test passes
- [ ] T1.5 done — audit_log collection getting writes from `deleteUserData`
- [ ] T1.6 done — prompt-injection regression in golden eval set
- [ ] T1.7 done — `firebase functions:secrets:access` works for all 4 secrets
- [ ] T1.8 done — no PII in last 100 Crashlytics events
- [ ] T1.9 done — auth-required test passes for all 29 callables
- [ ] IRP one-pager written

Only T1.1, T1.3, T1.4 are HARD blockers. T1.2, T1.6, T1.7, T1.8, T1.9 are STRONG-recommended. T1.5 can ship with first hotfix.

---

## Cross-references

- `~/.claude/knowledge/library/notes/oreilly_cybersec_risk_mgmt.md` — source synthesis
- `tools/girlai2/docs/ARCHITECTURE.md` — service map
- `~/.claude/rules/agent-operation-discipline.md` Rule 10 (blast radius / reversibility)
