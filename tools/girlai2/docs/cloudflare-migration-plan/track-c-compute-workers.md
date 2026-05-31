# Track C — Backend Compute Migration: Firebase Functions → Cloudflare Workers

**Status:** Planning. No code changes.
**Scope:** Port `tools/girlai2/functions/` (TypeScript, Node 20 runtime per `package.json`, ~34 entry points) from Firebase Cloud Functions Gen-1 to Cloudflare Workers (V8 isolates).
**Out of scope:** Storage (Track A), DB/Firestore (Track B), Auth (Track D), aux/observability (Track E). This document references the Track B database swap as a hard dependency and assumes those handlers are being delivered in parallel.

---

## 1. Function inventory

Grepping `tools/girlai2/functions/src/index.ts` for `export const` yields **34 entry points** (33 listed + the auth-trigger `onUserCreate`). Of these, **31 are `https.onCall` callables**, **1 is `https.onRequest`** (RevenueCat webhook), **1 is an `auth.user().onCreate` trigger**, and **1 is a `firestore.document().onCreate` trigger** (push notification fan-out).

### 1a. Callables (HTTPS — 31)

| # | Name | Line | Purpose | Stateful? | Heavy deps |
|---|---|---|---|---|---|
| 1 | `generateResponse` | 223 | Main LLM turn: classify intent → router → OpenAI/Anthropic/Gemini → quality workflow → write to Firestore. 1GB / 60s. | Yes (writes conv) | OpenAI, Anthropic, Gemini, Firestore |
| 2 | `processLiveModeInput` | 683 | Live-mode (streaming voice) input handler. | Yes | OpenAI, Firestore |
| 3 | `createRealtimeSession` | 889 | Mints an OpenAI Realtime ephemeral session. | Read-only (mint token) | OpenAI |
| 4 | `analyzeImage` | 961 | GPT-4o vision call on a user-uploaded image. | Mixed (logs usage) | OpenAI |
| 5 | `generateVoiceMessage` | 1078 | TTS → audio + visemes. ElevenLabs primary, Azure fallback. 512MB / 120s. | Mixed (cache write) | **Azure SDK (Node-only)**, ElevenLabs REST, Firestore (cache) |
| 6 | `updateCompanionConfig` | 1270 | Update proactive-messaging config. | Yes | Firestore |
| 7 | `generateProactiveMessage` | 1318 | Generate Aria-initiated message. | Yes | LLM stack |
| 8 | `submitMessageFeedback` | 1382 | Thumbs/feedback record. | Yes | Firestore |
| 9 | `getCompanionQualityInsights` | 1447 | Read quality metrics. | Read-only | Firestore |
| 10 | `runGoldenPromptSuite` | 1478 | Run eval suite (LLM-heavy, admin-only). | Yes | Full LLM stack |
| 11 | `setGoldenBaseline` | 1530 | Mark a golden run as baseline. | Yes | Firestore |
| 12 | `runStrictLaunchGate` | 1575 | Eval launch gate. | Yes | Firestore + LLM |
| 13 | `analyzeGalleryPhoto` | 1692 | Image-classify a gallery photo. | Yes | OpenAI |
| 14 | `getMilestones` | 1761 | Read milestone state. | Read-only | Firestore |
| 15 | `acknowledgeMilestone` | 1787 | Mark milestone displayed. | Yes | Firestore |
| 16 | `ensureRelationshipDashboard` | 1818 | Bootstrap dashboard state. | Yes | Firestore |
| 17 | `getAriaInnerThought` | 1849 | Generate inner-life snippet. | Yes | LLM stack |
| 18 | `saveUserImportantDate` | 1922 | Save a user date. | Yes | Firestore |
| 19 | `deleteUserImportantDate` | 1962 | Delete a date. | Yes | Firestore |
| 20 | `getUserImportantDates` | 1986 | Read dates. | Read-only | Firestore |
| 21 | `registerFCMToken` | 2019 | FCM token registration. | Yes | Firestore. **NB:** FCM = Firebase Cloud Messaging — likely changes under Track D/E (push provider swap). |
| 22 | `getUserMemories` | 2165 | Read user memories. | Read-only | Firestore |
| 23 | `deleteUserMemory` | 2206 | Delete memory. | Yes | Firestore |
| 24 | `startVirtualDate` | 2246 | Begin virtual date session. | Yes | Firestore |
| 25 | `endVirtualDate` | 2266 | End virtual date session. | Yes | Firestore |
| 26 | `getCurrentVirtualDate` | 2277 | Read current session. | Read-only | Firestore |
| 27 | `getMoodSummary` | 2290 | Mood/relationship summary. | Read-only | Firestore |
| 28 | `generateAriaGift` | 2335 | Generate a virtual gift. | Yes | LLM + Firestore |
| 29 | `deleteUserData` | 2563 | GDPR-style delete. | Yes (destructive) | Firestore + Storage |
| 30 | `exportUserData` | 2681 | GDPR-style export. | Read-only (heavy) | Firestore + Storage |
| 31 | `harmReport` | 2801 | User-submitted harm report. | Yes | Firestore |

### 1b. Triggers (3)

| Name | Line | Trigger type | Purpose | Notes |
|---|---|---|---|---|
| `onUserCreate` | 648 | `auth.user().onCreate` | Bootstrap user profile doc on signup | Disappears with Firebase Auth removal. Replace with Track D auth-provider webhook → small Worker. |
| `sendPushOnNewAriaMessage` | 2134 | `firestore.document('conversations/{cid}').onCreate` | Send FCM push on new Aria message | Replace with DB trigger from Track B (Postgres notify / D1 trigger) → Worker → push provider. |
| `handleRevenueCatWebhook` | 2435 | `https.onRequest` | RevenueCat webhook handler | Pure HTTP webhook. Ports trivially to a Worker fetch handler with `request.method === 'POST'` gate. |

### 1c. Categorization for porting

- **Pure-logic (no external state) leaf modules**: `responseVariancePool`, `voiceVariancePool`, `promptComposer`, `promptShellService`, `emotionUtils`, `textNumericUtils`, `signalDetectors`, `userIntentClassifiers`, `userSignalClassifiers`, `routeIntentDetection`, `providerRouter`, `temporalContext`, `scopeGuard`, `failureClass`, `promptInjectionGuard`. **All port without modification** to Workers — pure TypeScript on standard JS primitives.
- **External-API only (no DB)**: `providerExecutionService`, `realtimeSessionService`, `visionService`. Port cleanly once SDK Web-compat is confirmed.
- **DB-bound (Firestore admin)**: `memoryService`, `voiceCache`, `recencyTracker`, `datesContextCache`, `auditLog`, `rateLimit`, `personaHistory`, `turnTrace`, `routeMetricsService`. HARD-DEPEND on Track B. The `voiceCache.ts` header already flags `FieldValue` Node-24 emulator quirks (commits `47165ac`, `52d0e8a`) — the same import patterns will need full rewrite against the new DB client.
- **Node-runtime-only**: `voiceService` (Azure SDK).
- **Read-only Firestore subscriptions**: a handful of read paths (`getUserMemories`, `getMoodSummary`, etc.) — easy migrations once Track B exposes the equivalent reads.

---

## 2. Workers compatibility audit

### What Just Works

- **`@anthropic-ai/sdk`** — official Workers support since v0.20+; current pin `^0.39.0` is fine.
- **`openai`** — v4 SDK uses `fetch` natively; Workers-compatible.
- **`@google/genai`** — newer Google GenAI SDK, fetch-based, Workers-compatible.
- **`elevenlabs`** — REST API client over fetch; Workers-compatible.
- **`uuid`** — works on Workers with `nodejs_compat` (or use `crypto.randomUUID()` directly).
- **`langfuse`** — fetch-based; works on Workers (verify trace flushing in async-context-only environment).
- **`crypto.createHash`** — Node API. Replace with Web Crypto `crypto.subtle.digest('SHA-256', ...)` — straightforward swap. `voiceCache.ts` line 24 + `index.ts` line 4 import `crypto`; both need updating.

### What Doesn't Work

- **`firebase-admin`** — Node-only. Entire surface is replaced by Track B's DB client + Track D's JWT verification. Every `admin.firestore()` call (~22 in `index.ts` alone) becomes the new DB client.
- **`firebase-functions`** — replaced wholesale by the Workers fetch handler + a thin onCall-shape adapter (see §4).
- **`@google-cloud/vertexai`** — Node-only client (uses `googleapis` auth). Either (a) port Vertex calls to `@google/genai` (the official replacement) and use API-key auth via `AI Studio` keys, or (b) drop Vertex entirely if all flows can run on `@google/genai`. Recommended: drop Vertex.
- **`microsoft-cognitiveservices-speech-sdk`** — Node-only. Uses WebSockets via `ws` package + native bindings for audio buffer assembly. Will not run on Workers. **See §2c for options.**

### `nodejs_compat` flag

Cloudflare added expanded Node.js APIs (`node:crypto`, `node:buffer`, `node:async_hooks`, partial `node:stream`, `node:util`, `node:net` etc.) behind the `compatibility_flags = ["nodejs_compat"]` flag in `wrangler.toml`. This covers:

- `Buffer` — yes
- `crypto.createHash` — yes (via `node:crypto` polyfill)
- `process.env` — partial (use `env` parameter instead — see §4)
- `stream.Readable` — partial
- `ws` (WebSocket client used by Azure SDK) — **no**; Workers ships its own WebSocket API; the Azure SDK's binary frame assembly + audio decoding does not run.

Recommendation: enable `nodejs_compat` for everything except `generateVoiceMessage`. Don't lean on it to "make Azure work" — it won't.

### 2c. Azure Speech SDK options

The voice service (`voiceService.ts`) is the single hardest porting problem. Options ranked:

1. **Call Azure Speech REST API directly from Workers** (recommended primary). Azure exposes a synchronous `/cognitiveservices/v1` POST endpoint that accepts SSML and returns the audio stream. It does NOT provide viseme events — those come from the SDK's WebSocket session. **Caveat:** Aria's viseme + blendshape timeline is consumed by the Flutter animation layer (line 35–36 of `voiceService.ts`), so losing visemes is a feature regression. Since ElevenLabs is the primary path and Azure is a fallback (`voiceService.ts:1403`), one acceptable shape is: ElevenLabs full path on Workers; Azure-as-emergency-fallback returns audio only (no visemes; client animation falls back to a generic mouth-shape heuristic from the existing `Character to viseme mapping` at line 1123 already used for ElevenLabs).
2. **Sidecar Node service** (Fly.io / Render / Railway). Run the Azure SDK on a tiny Node host. Workers proxy calls to it for Azure-fallback path only. Cost: ~$5–10/mo for a sleeping Fly machine, plus operational surface area. Recommend only if visemes-on-Azure-fallback are deemed essential.
3. **Wait for a Microsoft Web SDK.** As of late 2025 the SDK ships a browser build (`SpeechSDK-JavaScript`) that works in browsers but not in V8 isolates (relies on Web Audio API + browser-specific WebSocket lifecycle). Not viable.

**Plan-of-record:** Option 1. Lose visemes on Azure fallback path; primary ElevenLabs path keeps the existing approximated-viseme code unchanged.

---

## 3. Migration strategy — sequenced

### Phase 1 — Pure-logic foundation (week 1–2)

Port leaf modules with no external deps. Build a single Worker scaffold (`wrangler init`, TypeScript, `nodejs_compat`). Wire one trivial callable (`getCompanionQualityInsights` minus its Firestore read — return mock data) to validate the onCall adapter (§4).

**Modules in scope:** `emotionUtils`, `textNumericUtils`, `signalDetectors`, `promptComposer`, `promptShellService`, `responseVariancePool`, `voiceVariancePool`, `providerRouter`, `failureClass`, `scopeGuard`, `routeIntentDetection`, `promptInjectionGuard`. Their existing unit tests (~15 of the 46-test suite) move over essentially unchanged.

Acceptance gate: pure-logic test suite green under `vitest` (the Workers-native test runner).

### Phase 2 — LLM-bearing callables (week 3–4) — HARD-DEPENDS on Track B

Port `generateResponse`, `processLiveModeInput`, `createRealtimeSession`, `analyzeImage`, `analyzeGalleryPhoto`, `generateProactiveMessage`, `getAriaInnerThought`, `generateAriaGift`. These touch the DB through `memoryService`, `recencyTracker`, `auditLog`, `rateLimit`, `turnTrace`, `voiceCache`, `datesContextCache`. **Phase 2 cannot start until Track B is at least dual-write-ready** so the new DB client surface is stable.

Co-port `providerExecutionService.ts` (no DB) and ensure each provider SDK (Anthropic, OpenAI, Gemini) initializes correctly in Workers (`new OpenAI({ apiKey: env.OPENAI_API_KEY })`). Confirm streaming responses work via Workers' `ReadableStream` for Realtime mints.

Acceptance gate: `generateResponse` end-to-end against a staging DB, parity with Firebase Functions output in a shadow eval (use `goldenEvalService` golden runs as the regression set).

### Phase 3 — Voice (week 5)

Port `generateVoiceMessage`. Default to ElevenLabs path (already REST). Implement Azure REST-only fallback per §2c Option 1. Wire `voiceCache` lookup/write against the new DB.

Acceptance gate: 50 voice turns under load test, p95 < Firebase baseline + 200ms.

### Phase 4 — Aux callables (week 6)

Port `updateCompanionConfig`, `submitMessageFeedback`, `getMilestones`, `acknowledgeMilestone`, `ensureRelationshipDashboard`, `saveUserImportantDate`, `deleteUserImportantDate`, `getUserImportantDates`, `getUserMemories`, `deleteUserMemory`, `startVirtualDate`, `endVirtualDate`, `getCurrentVirtualDate`, `getMoodSummary`, `harmReport`, `deleteUserData`, `exportUserData`, `runGoldenPromptSuite`, `setGoldenBaseline`, `runStrictLaunchGate`.

Most of these are thin DB wrappers (read or single write) and port mechanically once Phase 2's DB-client patterns are settled.

Port `handleRevenueCatWebhook` as a separate `fetch` route (HTTP, not onCall). Re-wire `registerFCMToken` against whichever push provider replaces FCM (likely **OneSignal** or **Expo Push** if Flutter mobile remains — confirm with Track E).

Acceptance gate: full callable parity, regression suite green.

### Phase 5 — Triggers + cutover (week 7)

- `onUserCreate` → replace with a webhook from the new auth provider (Track D delivers this). A small Worker accepts the auth-provider's "user-created" webhook and creates the user doc.
- `sendPushOnNewAriaMessage` → replace with DB-level change subscription. If Track B is on **Cloudflare D1**, schedule a polling Worker (cron 1-min) reading new conv rows; if on **Postgres (Neon)**, use Postgres `LISTEN/NOTIFY` over the Hyperdrive connection or a Trigger Worker. If on **Cloudflare Queues**, the DB write itself enqueues.
- Deploy Workers to production behind the existing `*.cloudfunctions.net` domain via DNS, run a 48-hour soak with traffic dual-routed (10% → Workers, 90% → Functions), then flip 100%.
- Decommission the Firebase Functions project (`firebase deploy --only functions:delete` for each function).

Acceptance gate: 7-day soak at 100% Workers, error rate flat against Firebase baseline.

---

## 4. Code-shape changes

### 4a. Callable signature adapter

Firebase Callables expect `{data, context}` and return JSON. The Flutter client uses `httpsCallable('generateResponse').call({...})` which wraps the payload as `{data: {...}}` and reads `context.auth.uid` from a Firebase ID token. Workers fetch handlers expect `(request, env, ctx)`.

Write a single `wrapCallable` adapter (one file, ~60 lines) that:

```typescript
// services/callable-adapter.ts
type CallableHandler<I, O> = (data: I, ctx: CallableContext) => Promise<O>;

export function wrapCallable<I, O>(h: CallableHandler<I, O>) {
  return async (request: Request, env: Env): Promise<Response> => {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
    const body = await request.json() as { data: I };
    const auth = await verifyAuth(request, env);   // Track D's JWT verifier
    const ctx: CallableContext = { auth, rawRequest: request, env };
    try {
      const result = await h(body.data, ctx);
      return Response.json({ result });            // matches Firebase callable response shape
    } catch (e) {
      return Response.json({ error: toHttpsError(e) }, { status: 400 });
    }
  };
}
```

Each route maps in `src/router.ts` (a Workers `itty-router` or hand-rolled switch on `url.pathname`):

```typescript
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    switch (url.pathname) {
      case '/generateResponse':       return wrapCallable(generateResponse)(req, env);
      case '/generateVoiceMessage':   return wrapCallable(generateVoiceMessage)(req, env);
      case '/handleRevenueCatWebhook':return handleRevenueCatWebhook(req, env);  // not wrapped
      // …32 more cases
    }
    return new Response('Not found', { status: 404 });
  }
} satisfies ExportedHandler<Env>;
```

The Flutter client config flips a single base URL (Track D / E concern) — no per-callable client changes.

### 4b. Auth check

`context.auth?.uid` (~31 call sites) → `ctx.auth?.uid` provided by the JWT verifier. Verifier reads `Authorization: Bearer <jwt>` (Track D will pick the auth provider — Supabase Auth, Clerk, WorkOS, or Cloudflare Access — and provide the verify helper). The wrapper exposes the same shape (`{uid, token}`) so the body of each handler doesn't change.

### 4c. Logging

`functions.logger.info/warn/error` (~80 call sites) → `console.log/warn/error`. Workers `console.log` ships to Logpush / Workers Logs / Tail. Wrap in a `log()` helper that adds the request ID + uid so tail output stays grep-able.

### 4d. Env vars

`process.env.OPENAI_API_KEY` (and ~15 others) → `env.OPENAI_API_KEY`. Pass `env` down via context. Plain text secrets go in `wrangler secret put OPENAI_API_KEY`; the rest in `wrangler.toml [vars]`.

### 4e. Tests

The 46-test suite under `tools/girlai2/functions/test/` uses Node's built-in `node:test` runner with custom stubs (`_firebase-admin-stub.js`, `_firebase-admin-firestore-stub.js`, `_firebase-functions-stub.js`). The pure-logic tests (~20 of 46 — `emotionUtils.characterization`, `prompt-composer`, `response-variance-pool`, `recency-tracker`, `intent-classifier`, `crisis-detection`, `scope-guard`, `failure-class`, `route-intent-detection`, `prompt-injection-guard`, `dates-context-cache`, `persona-history`, `provider-router`, `history-compactor`, `candidate-scoring`, `prompt-cost`, `estimate-ai-call-timing`, etc.) survive a runner swap to **Vitest** (Vitest has first-class Workers/Miniflare support via `@cloudflare/vitest-pool-workers`).

The 26 tests that touch firebase-admin stubs need rewriting against the Track B DB client's mock surface. `app-check-gate`, `auth-required`, `langfuse-init` are bordering — they stub the platform but test behavior independent of it; should port with mild changes.

---

## 5. Cost comparison

**Current Firebase Functions (Gen-1, us-central1):** $0.40 per million invocations + $0.0000025/GB-second + $0.0000100/GHz-second + egress. The expensive callables are the 1GB/60s `generateResponse` and the 512MB/120s `generateVoiceMessage`. At a reasonable Aria volume (assume 10k DAUs × 10 LLM turns + 5 voice turns/day = 150k callable invokes/day = 4.5M/month), the current bill is heavily weighted by GB-sec (LLM wall time dominates: 5-15s p50 awaiting external API → billed as 1GB × 10s = 10 GB-sec × 4.5M = 45M GB-sec → ~$112/mo on memory-time alone, plus invokes ~$1.80, plus egress).

**Cloudflare Workers (Standard plan, $5/mo):** 10M requests included, $0.30/M after. **CPU time only is billed**, not wall time — the Worker is not metered while awaiting `fetch` to OpenAI/Anthropic. Aria's LLM-bearing callables spend ≥95% of wall time awaiting external APIs; actual CPU per request is in the single-digit ms (intent classify, prompt assembly, response post-processing). At 4.5M req/month: $5 base; CPU well under the $0.02/M-millisecond ceiling.

**Estimated saving:** the GB-second line item disappears entirely. Net savings ~$100/mo at current scale, growing linearly with volume.

**Caveats:** Cloudflare egress on response bodies is free (Workers do not charge egress under standard plans). DB egress depends on Track B choice (D1 free; Neon Postgres has some egress; Hyperdrive caches mitigate).

---

## 6. Risks + mitigations

### Risk 1 — Azure Speech SDK incompatibility (high, mitigable)

**Mitigation:** REST API path (§2c Option 1). Accept loss of Azure-fallback visemes (impact: animation falls back to text-approximation, identical to current ElevenLabs path). Re-evaluate Option 2 (Fly.io sidecar) only if fallback path becomes primary.

### Risk 2 — Workers CPU budget per invocation (medium)

Workers default CPU limit is 30s on the Standard plan (was 50ms — limit was raised in 2024). LLM calls wait on external `fetch` which doesn't count toward CPU time, but heavy synchronous post-processing (~`qualityOrchestrationService` runs multiple candidates through scoring) needs measuring. Mitigation: profile `runPostGenerationQualityWorkflow` early; if any sync segment exceeds 30s CPU, split into a Durable Object or chain two Workers.

### Risk 3 — Test rewrite scope (medium)

26 of 46 tests touch firebase-admin stubs. Rewriting them against the new DB client client + Vitest is ~3–5 days of work. Mitigation: write the new DB-client mock once, share across tests, prioritize porting tests that gate critical paths (`memory-write-gate`, `app-check-gate`, `auth-required`, `provider-router`) before the trivial CRUD wrappers.

### Risk 4 — Realtime streaming / SSE through Workers (low–medium)

`createRealtimeSession` mints OpenAI Realtime tokens; the actual WebSocket connection happens client → OpenAI directly. The mint endpoint is a single HTTP call and ports cleanly. If a future feature streams from Workers, use Workers Streams (`ReadableStream`) — Workers fully support SSE and WebSocket-server APIs. No blocker today.

### Risk 5 — Lost Firebase Functions features (low)

`minInstances` keep-warm: Workers cold-start is sub-10ms; non-issue. Per-region routing: Workers auto-route to nearest edge. `functions.config()` runtime config (used by `handleRevenueCatWebhook:2447`): replaced by `wrangler secret`. None of these are functional regressions.

### Risk 6 — Worker bundle size limit (low)

Workers Standard tier: 10MB compressed. Sifting through `node_modules` — Anthropic SDK + OpenAI SDK + Gemini SDK + ElevenLabs combined ~3MB compressed. Comfortable. Tree-shaking via esbuild (default in Wrangler) keeps this well under limit. Verify post-Phase-2.

---

## 7. Effort estimate

Solo developer, focused work (5h/day on this track), no major scope creep:

| Phase | Scope | Days |
|---|---|---|
| 1 | Pure-logic + scaffold + onCall adapter + first Worker | 6–8 |
| 2 | LLM callables + DB-client integration + golden parity | 10–12 |
| 3 | Voice port + Azure REST fallback | 4–6 |
| 4 | Aux callables (20 of them, mostly mechanical) | 5–7 |
| 5 | Triggers + dual-route + soak + cutover | 4–5 |
| **Total** | | **29–38 days** (≈ 6–8 calendar weeks) |

Compresses to ~4 weeks if Track B database delivery is complete and stable BEFORE Phase 2 starts. Extends by 1–2 weeks if Azure visemes-on-fallback is deemed a hard requirement (Option 2 sidecar).

---

## 8. Open questions for the owner

1. **Azure visemes on fallback path — keep or drop?** Recommendation: drop (use text-approximation viseme fallback already used for ElevenLabs). Confirm acceptable.
2. **Push notifications provider** — does Track D/E pick OneSignal / Expo / Web Push? Affects how `sendPushOnNewAriaMessage` and `registerFCMToken` rewire.
3. **DB choice (Track B)** — D1 / Neon Postgres / Cloudflare KV+Durable Objects? Each implies a different client shape for ~30 files. The plan above is DB-agnostic but Phase 2 cannot start without this decided.
4. **Dual-route cutover window** — 48h or 7d? Longer soak is safer but doubles cost briefly and requires keeping Firebase Functions deployed.
5. **Vertex AI** — okay to drop entirely in favor of `@google/genai`? `package.json` lists both; if no production code path requires Vertex's enterprise-only models, dropping it simplifies the port.
