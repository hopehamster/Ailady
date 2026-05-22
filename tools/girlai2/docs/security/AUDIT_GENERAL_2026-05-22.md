# Aria General Audit — 2026-05-22

Read-only audit of Aria's non-security surfaces against Round 8 synthesis (`~/.claude/knowledge/library/SYNTHESIS_v2.md` L677-894) and the 19 mining notes. Sibling to `AUDIT_2026-05-22.md` (security scope: STRIDE, auditLog, rateLimit, promptInjectionGuard, RevenueCat, auth-test, T1.A–T1.H, open questions). Scope here: memory, routing, orchestration, observability, performance, UX, dev workflow, tests.

Target stage: solo-founder, ≥20-tester closed beta. Recommendations are sized accordingly — anything Big-Co-flavored is explicitly skipped.

---

## 1. Memory architecture

**Files:** `functions/src/services/memoryService.ts` (3,038 LOC), `functions/src/services/memoryControllerService.ts` (1,258 LOC).

### Current state

- Single rich aggregate `IntelligentMemory` (memoryService.ts L255-275) bundles 17 fields onto one Firestore doc at `intelligentMemory/{userId}` (L1834). Read+write happens via `getIntelligentMemory` (L1831) and `updateIntelligentMemory` (L1915).
- Importance is scored per turn via `scoreMessageImportance` (called L1933) and attached to both the user and assistant `ScoredMessage` (L222-230) before append. So importance-weighting *exists* at the granular-message level.
- Semantic recall is genuinely two-stage: embedding via `text-embedding-3-large` (L2599-2602) then `userId`-scoped Firestore query (L2611) with cosine + recency decay + importance bias (L2627-2634). Cross-tenant filter is `userId == $userId` BEFORE retrieval — that's the right shape, matches Theme 3 floor.
- `memoryControllerService.ts` is the surprise: a full evidence-precedence engine (L74-176) with source weights, freshness half-life, current-exchange bonus, canonical-name bonus, resolved/expired penalties. This is *exactly* the "governor validation gate" Round 8 calls out as missing (Theme 8) — except it lives next to memory rather than gating writes.

### Gaps vs `oreilly_building_ai_remembers.md`

- **No 4-bucket typing.** Working / episodic / semantic / procedural are conceptually present (recentContext / emotionalMoments / semanticMemory collection / pacingProfile + sessionArc) but stored under one document with no typed access pattern. Matches Tier-2 deferral T2.1.
- **`memoryControllerService` is not on the write path.** `updateIntelligentMemory` (L1915) writes scored messages directly; the precedence engine only fires from policy callers like `buildRecentExchangeState` (L954) and `buildChronologyState` (L1131) — i.e. it adjudicates READ-time conflicts, not WRITE-time validation. The governor-prompt gate (T2.2) is genuinely missing.
- **No immutable memory audit log.** `auditLog.ts` exists (security audit covers it) but `memoryService` never emits to it on writes. Reconstructability of "why did Aria assert X about me" is impossible today.
- **Self-poisoning vector.** AI response text flows into `recentContext` (L1955-1959) and `indexSemanticMemoryForTurn` (L2497) without sanitization. T1.C output sanitization gap confirmed at the memory write boundary.

### Next steps

Promote `memoryControllerService.scoreMemoryEvidence` from a read-time adjudicator to a write-time gate inside `updateIntelligentMemory`. Add an `auditLog` write on every `coreFacts` mutation. Defer full 4-bucket typing to post-beta unless a tester complains "Aria forgot my allergy."

---

## 2. Multi-model routing / fallback

**Files:** `functions/src/services/llmService.ts` (3,721 LOC), `providerExecutionService.ts` (207 LOC), `voiceService.ts` (1,632 LOC), `visionService.ts` (477 LOC).

### Current state

- **Reactive waterfall already in place.** `generateAIResponse` (llmService L2920) runs: fast-path Gemini for low-effort turns (L3389-3398) → Anthropic Claude primary (L3400-3427) → OpenAI fallback (L3446-3476) → Gemini final fallback (L3487-3509). Connection-failure circuit-breakers at L3433-3441 (Anthropic), L3478-3482 (OpenAI) with timed disable windows.
- **Provider isolation is clean.** `providerExecutionService.ts` exports three exec functions — OpenAI L81, Anthropic L117, Gemini fallback L148. Each is a leaf: no cross-calling, no shared state. Cascading-error containment per `oreilly_agent_reliability.md` is structurally good here.
- **Route decision exists.** `determineRouteDecision` (L2479-2509) classifies turn as `fast` vs `quality` based on crisis signal, complexity, deep-analysis intent, repair signal. This IS the intent classifier the Round-8 multi-model finding asks for — it just doesn't act on it for *provider selection*, only for *agent-skip flags*. `routeDecision.skipQualityAgent` saves work but every route still talks to the same primary provider.
- **No retryable-vs-non-retryable taxonomy.** `isProviderConnectionError` (L242) is the only error classifier; auth errors (`invalid_api_key`, status 401) get bubbled up as fatal at L3704, everything else falls through.

### Gaps vs `oreilly_multi_model_ai.md` + `oreilly_agent_reliability.md`

- **No proactive intent→model routing.** The classifier exists but its output doesn't pick a *cheap* model for greetings. Theme 6 finding directly applies: T2.3 deferral is correct but the substrate (`determineRouteDecision`) is already there. When ready to enable, fast-path through Gemini Flash on `route === 'fast'` and avoid Claude Opus entirely for those turns.
- **No route-distribution metric.** Every turn logs `modelUsed` but no aggregation exists; can't answer "what % of turns hit Opus" without a Firestore query.
- **No regex guardrails before classifier.** Out-of-scope guard (L2934-2942) is the closest thing and works well; could pre-filter to skip the classifier entirely on obvious greetings.

### Next steps

Two small changes give ~80% of T2.3's value: (a) `voiceService.shouldUseFastTurnPath` already exists — route those to Gemini directly, skip Claude. (b) `auditLog` a `route` field on every turn so a daily report can compute distribution. The provider waterfall itself is solid; don't refactor.

---

## 3. Agent loops / orchestration

**Files:** `qualityOrchestrationService.ts` (203 LOC), `postResponseOrchestrationService.ts` (234 LOC), `responseAssemblyService.ts` (118 LOC).

### Current state

- **Architecture is a fixed pipeline, NOT a reasoning agent.** No tool-calls, no agentic loops, no recursive plan-step-observe. `generateAIResponse` is a fan-out of stages with per-stage budgets enforced via `createTimedStage` (L2511-2554) racing each stage against a timeout `Promise.reject`. This matches `oreilly_how_agents_work.md` "agents are workflows" framing — workflow IS the agent.
- **Stop conditions exist via timeouts.** Every stage gets a budget (`responseStageMs`, `criticStageMs`, `personaAuditStageMs`, `emotionStageMs`). Falls back to guard-only path on timeout (qualityOrchestrationService L124-135). This is the "stop condition + escalation path" the synthesis calls for, just expressed as time not step-count.
- **Quality orchestration is two-pass.** Critic → guard → chronology → persona audit → optional rewrite → re-audit (qualityOrchestrationService L108-185). Round-trip is bounded, no infinite recursion possible.
- **Post-response orchestration is fire-and-forget.** Emotion analysis runs in parallel; shadow-benchmark + memory update are `.catch()`-only background promises (postResponseOrchestrationService L177-205, L213-224). Failure is non-fatal.

### Gaps vs `oreilly_how_agents_work.md` + `oreilly_building_ai_agents_multi_agent.md`

- **No `turnId` thread.** Confirmed gap matching T1.D. `stageTimingsMs` (L2932) and `stageContracts` arrays accumulate per-turn diagnostics but get embedded into `qualityMeta` on the response and never persisted to a queryable trace collection. Beta-tester "Aria said something weird" reports are unreproducible.
- **No tool-call ceiling.** Not applicable architecturally — there are no tools. T1.G's `enforceToolCallBudget` from the synthesis maps onto Aria as "duration ceiling on the *single* model call." `createTimedStage` already provides this per-stage; what's missing is a *global* turn-level wall-clock that aborts the whole pipeline.
- **Reconstructability is good in-memory, lost on disk.** `stageContracts.push(...)` (L2534-2540) builds a beautiful per-turn audit trail; it dies when the function returns.

### Next steps

The trace substrate Round 8 wants (`turnTraceService` T1.D) basically already exists in-memory — the work is plumbing `stageContracts` + `stageTimingsMs` + prompts + final output into a per-turn Firestore subcollection. The hardest part (collection) is done.

---

## 4. Observability

**Files:** `lib/main.dart` L47-59, `lib/core/services/analytics_service.dart` (109 LOC), `functions/src/services/promptCostService.ts` (78 LOC), `pubspec.yaml` L20-21.

### Current state

- **Crashlytics wired correctly.** `FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(!kDebugMode)` (lib/main.dart L50-51), `recordFlutterFatalError` on FlutterError.onError L53, `recordError(fatal:true)` on PlatformDispatcher async errors L56, and a top-level `runZonedGuarded` catch L107. Solid.
- **Analytics is a thin centralized wrapper.** `analytics_service.dart` exposes typed `logEvent`, `setUserId`, `setUserProperty`, `FirebaseAnalyticsObserver` for screen tracking. Defensive try/catch on every call. No event names listed beyond a comment ("Event naming convention: snake_case, ≤40 chars") so I can't confirm coverage.
- **`promptCostService.ts` is misnamed.** Despite the name it does NO cost tracking — only history-fetch sizing (L17-19) + simple/sensitive/deep regex helpers (L20-29) + prompt section composition (L31-35). Per-call token spend is logged via `functions.logger.info` on each provider call but not aggregated.
- **No Cloud Trace spans, no TTFT/TPOT separation.** Per-stage `durationMs` is recorded in `stageTimingsMs` and survives into the response qualityMeta but not into any traces backend.

### Gaps vs `oreilly_genai_google_cloud.md` + `oreilly_ai_perf.md`

- **No prefix-cache hit-rate metric.** Anthropic provider call (providerExecutionService L129-134) doesn't set `cache_control` breakpoints. Whether prefix caching is even firing is unknown.
- **No streaming.** Grep confirms zero `stream:true` or SSE handling across `functions/src/services`. Theme 6 "response streaming as #1 UX fix" applies — defer per T2.4 but document.
- **`promptCostService` should track cost, not just compaction.** Trivial to add a per-turn `estimatedTokens × $/k` aggregation written to `users/{uid}/usage`. Required substrate for T2.3 routing decisions and the LEV audit referenced in `agent-operation-discipline.md` Rule 11.

### Next steps

Two cheap wins: (a) Rename `promptCostService` → `promptShapingService` OR actually add cost tracking; the name lies today. (b) Add `cache_control: ephemeral` breakpoints on Anthropic call between system+persona block and turn-specific section — matches T1.H.

---

## 5. Performance

**Files:** `promptShellService.ts` (228 LOC), `promptAugmentService.ts` (310 LOC), `responseAssemblyService.ts`, `promptCostService.ts`.

### Current state — prompt ordering

`responseAssemblyService.buildResponseAssembly` (L42-118) composes `effectiveSystemPrompt` in this order (L66-90):

1. `systemPrompt` — built by `promptShellService` (identity + core memory + truth kernel)
2. `personalityBlock`
3. `personaVoiceBlock`
4. `innerLifeBlock`
5. `relationshipBlock`
6. `emotionalMemoryBlock`
7. `moodBlock` — **per-turn signal**
8. `loreBlock`
9. `semanticRecallBlock` — **per-turn semantic recalls**
10. `recentExchangePriorityBlock` — **per-turn**
11. `datesContextBlock` — semi-stable
12. `chatModeBlock`
13. `buildConversationPolicyDirectives(...)` — **per-turn plan**
14. `buildConversationPolicyEnhancers(...)` — **per-turn signals**

Then a `system` message + recent conversation + the user's `userMessage` are appended (L92-105).

### Gap vs T1.H + `oreilly_ai_perf.md`

**Ordering is wrong for prefix-cache reuse.** Per-turn content (mood, semantic recall, recent-exchange, policy directives based on this turn's signals) is interleaved with long-lived content (personality, persona voice, inner life, relationship). Every turn invalidates the cache from the point of the first per-turn block forward.

The correct order is roughly: `[SYSTEM identity] → [PERSONA stable] → [LONG-LIVED MEMORY] → [break] → [PER-TURN SIGNAL/POLICY] → [USER MSG]`. The current code mixes stable (personalityBlock, personaVoiceBlock) AFTER per-turn (moodBlock at position 7, loreBlock at 8 — lore is actually semi-stable, semanticRecall at 9 is per-turn).

### History compaction

`compactPromptAugmentsForRoute` (promptCostService L38-54) on fast route zeroes loreBlock, semanticRecallBlock, innerLifeBlock, emotionalMemoryBlock, and conditionally relationshipBlock. Good — keeps fast turns lean.

`estimateInitialHistoryFetchLimit` (L56-78) picks 16 vs 40 history rows by message complexity. Reasonable.

### Next steps

Split `composeSystemPromptSections` (promptCostService L31-35) into two arrays — `stableSections` and `turnSpecificSections` — and join with a clear delimiter line. Then add an explicit Anthropic `cache_control` breakpoint at that delimiter. This is ~2h work and matches T1.H exactly. Single highest-leverage perf change available right now.

---

## 6. UX / chrome / immersive mode

**Files:** `lib/features/chat/widgets/chrome_visibility_controller.dart` (237 LOC), `lib/features/chat/screens/chat_screen.dart` (1,209 LOC).

### Current state vs `oreilly_designing_ai_interfaces.md` three-channel model

- **Channel 1: Explicit prompting.** Text input + voice input both present (`voice_input_button.dart` imported chat_screen L11, `_sendMessage` L395-426). Solid.
- **Channel 2: Direct manipulation.** Tap-to-toggle-chrome via GestureDetector at chat_screen L737-746 plus rich chip cluster (`aria_inner_world_chip`, `upcoming_dates_chip`, `virtual_date_chip` — L15, L28, L29). Direct manipulation on individual messages (long-press to react, edit, regenerate) is NOT present — only the screen-level chrome toggle.
- **Channel 3: Implicit context.** Genuinely implemented. `llmService.UserEnvironmentContext` L85-99 carries city, region, tempC, weatherDesc, isPrecipitating, isExtremeTemp, localTimeIso, localHour, localDayOfWeek, with `locationAwarenessEnabled` consent flag at L98. Threaded through prompt at `promptShellService.buildUserWorldBlock` L158-209 with explicit "use SUBTLY, never imply surveillance" instructions — that's exactly the implicit-context discipline the book argues for.

### Chrome controller specifics

`ChromeVisibilityController` is clean and well-documented. 4-second inactivity timeout (L50), respects keyboard / transcript / voice-only modes (L152-191), persists `aria.chat.immersive_mode` to SharedPreferences (L49), broadcasts pref changes across instances via a static stream bus (L76-77). Default ON (L57). Disposal is correct (L230-236).

### Gap

Channel 2 is shallow. The synthesis (Theme 7, T1.E HITL) wants direct-manipulation on emotional/crisis content — e.g. "this response felt off" tap. Currently the only message-level affordance is voice playback. No long-press reaction, no "regenerate," no "tell me more," no per-message feedback.

### Next steps

Add per-message direct-manipulation in the chat list — minimum viable: long-press → small reaction sheet with thumbs up/down + "regenerate" + "tell me more." The thumbs feedback already has a backend (`submitResponseFeedback` index.ts; `recordResponseFeedback` memoryService L2708) — the UI is the missing half.

---

## 7. Code quality / dev workflow

**Findings vs `oreilly_clean_ai_agentic.md`, `oreilly_beyond_vibe.md`, `oreilly_genai_swdev.md`.**

- **No `specs/` directory.** Confirmed via Glob — no Gherkin-as-inviolate-truth spec files. Maps to T2.6 deferral. Synthesis explicitly says this is fine at 20-tester scale.
- **No `.claude/hooks/` directory** in `tools/girlai2`. Hook-driven workflow gating (per `claude-code-mastery.md` rule 13 sibling pattern) not adopted.
- **CLAUDE.md size unknown** — no file at `tools/girlai2/CLAUDE.md` per Glob. Likely lives at repo root; not in audit scope but worth noting that the synthesis recommends ≤500 lines.
- **`docs/` directory is enormous** (~70+ markdown files). Mix of valid architecture docs (ARCHITECTURE.md, DATA_FLOWS.md, COMPONENT_INVENTORY.md), valid runbooks (MONITORING_AND_MAINTENANCE.md, TESTING_PROCEDURES.md), pre-existing audits (REPO_DIVERGENCE_AUDIT_2026-04-05.md), and a worrying number of `_tmp_*` artifacts (`_tmp_aria_device_test`, `_tmp_context7_review`, `_tmp_semantic_sweep_20260327_*` — 7 versions of the same dump). Doc rot is real.
- **Service file sizes are concerning:** `memoryService.ts` 3,038 LOC, `llmService.ts` 3,721 LOC, `conversationPolicyService.ts` 1,555 LOC, `voiceService.ts` 1,632 LOC, `truthKernelService.ts` 1,035 LOC, `memoryControllerService.ts` 1,258 LOC. Uncle Bob's "small files beat god classes" applies; these are god classes. They're also locked from edit by audit guardrail for two of them, which suggests this is acknowledged.
- **No `[AI-assisted]` commit tagging convention** observable from outside (no git inspection done; comments in code don't reference it).

### Next steps

`docs/` cleanup is a 30-minute solo-founder task that returns hours later when navigating. Delete the 7 `_tmp_semantic_sweep_*` directories. Move active runbooks to `docs/runbooks/`, archived audits to `docs/archived/`. Skip the Gherkin-spec rewrite — defer matches synthesis.

---

## 8. Tests

**Files inventoried:**

```
functions/test/
  auth-required.test.js
  conversation-policy-opener-variety.test.js
  conversation-policy-voice-tone.test.js
  prompt-cost.test.js
  prompt-injection-guard.test.js
  voice-readiness.test.js
  _firebase-functions-stub.js

test/                              (Flutter app tests)
  helpers/firebase_mocks.dart
  helpers/test_helpers.dart
  unit/avatar/avatar_motion_controller_test.dart
  unit/services/auth_service_test.dart
  unit/services/chat_service_test.dart
  unit/services/firebase_service_test.dart
  unit/services/user_service_test.dart
  unit/utils/chat_error_handler_test.dart
  unit/utils/phone_validator_test.dart
  widget_test.dart
  run_native_tests.sh
  run_tests.sh
```

### Coverage assessment

- **Backend (functions/test/):** 6 test files. Security-critical paths: auth-required (T1.F substrate), prompt-injection-guard (T1.6 input scan), prompt-cost (compaction). Conversation behavior: opener variety + voice tone. No tests for memory CRUD, no tests for memoryControllerService precedence math, no tests for the provider waterfall, no tests for orchestration timeouts, no tests for rate-limit enforcement, no cross-tenant isolation test (T1.B confirmed missing).
- **Flutter app (test/):** 7 unit test files covering services (auth, chat, firebase, user), utils (error handler, phone validator), and avatar motion. Zero tests for the chrome visibility controller, zero tests for the immersive-mode pref bus.
- **No property-based tests** (no `fast-check` import anywhere). T2.8 deferral confirmed valid.
- **No golden eval test runner** in `test/` despite `goldenEvalService.ts` existing — golden runs presumably happen via Firebase callable invocation against the live emulator, not as `npm test` fixtures.

### Notable gap

The synthesis Tier-1 actions T1.A–H each imply at least one new test. The auth-required test exists and is the right pattern; replicate it for cross-tenant memory (T1.B), App Check enforcement (T1.F), and timeout/tool-budget (T1.G).

### Next steps

Add one test file per Tier-1 action as you ship it. The pattern is established (`auth-required.test.js`). Highest-priority single addition: cross-tenant memory isolation regression — addresses Theme 3 head-on.

---

## Top 5 NON-security findings — ranked by leverage

### 1. Prompt-cache reuse via reordering (T1.H execution)
The single highest-leverage non-security change. Prompt assembly today interleaves stable and per-turn content, defeating Anthropic's prefix cache and any future Gemini/OpenAI equivalents. Two-hour fix in `responseAssemblyService.ts` L66-90 + add explicit `cache_control` breakpoint in `providerExecutionService.executeAnthropicCompletion` L129. Pays back forever in token cost + TTFT.

### 2. Per-turn trace persistence (T1.D substrate)
`stageContracts` + `stageTimingsMs` are computed beautifully in-memory in `generateAIResponse` and discarded. Persist them to `users/{uid}/turnTraces/{turnId}` with the user input + final output and you've unlocked: beta-bug reproducibility, route-distribution metric (Theme 6), governor audit trail (Theme 8), retroactive sock-puppet eval (T2.5). Substrate first → 5 downstream blocks fall into place.

### 3. Direct-manipulation on individual messages (Theme 7 channel-2)
Long-press menu on assistant messages with thumbs up/down + regenerate + tell-me-more. Backend (`submitResponseFeedback`, `recordResponseFeedback`) is already wired; UI is missing. This is the closed-beta feedback loop. Without it, "did this turn feel right?" is hidden in tester memory only.

### 4. Promote `memoryControllerService` to write-time gate
The precedence engine (memoryControllerService L261-322) already encodes everything the "governor validation gate" from `oreilly_building_ai_remembers.md` asks for — but it only runs at READ time. Wiring it into `updateIntelligentMemory` before append to `coreFacts`/`scoredMessages` blocks both self-poisoning (Theme 2) and contradictory memory accumulation. Bigger architectural win than 4-bucket typing.

### 5. Doc directory triage
70+ docs in `docs/` with 7+ `_tmp_*` artifacts. Costs orientation time on every cold-start session. 30-minute cleanup, lasting return. Move active to `docs/runbooks/`, archives to `docs/archived/`, delete `_tmp_*`.

---

## What the audit reveals that the synthesis MISSED or got wrong

### A. `memoryControllerService` exists and is *more sophisticated* than the synthesis suggests
The synthesis Theme 8 + T2.1/T2.2 frame Aria's memory as "one bucket, no governor." That's wrong. There IS a governor — `memoryControllerService.scoreMemoryEvidence` with source weights, freshness half-life, canonical-name bonus, resolved/expired penalties. The actual gap is plumbing, not absence: the governor adjudicates READ-time conflicts but doesn't gate WRITE-time validation. T2.1 (4-bucket typing) is genuinely Tier 2; T2.2 (governor gate) is *closer to Tier 1* than the synthesis implies because the code already exists — it just runs at the wrong moment.

### B. Architecture is correctly NOT an agent loop
The synthesis pulls heavily from agent-orchestration sources (`how_agents_work`, `building_ai_agents_multi_agent`, `agent_reliability`). Aria's actual architecture is a fixed-DAG pipeline with no tool-calls, no reasoning loops, no observe-think-act recursion. `oreilly_how_agents_work.md` F3 ("workflow is the agent") is the right framing; the others' tool-call-budget / stop-condition vocabulary maps onto Aria as "stage timeouts," which `createTimedStage` already implements. T1.G's `enforceToolCallBudget` doesn't map cleanly — what Aria needs is a global pipeline wall-clock, not a tool-call counter.

### C. Provider waterfall is more mature than the synthesis credits
The synthesis (Theme 6, T2.10) describes Aria's fallback as "reactive waterfall" needing health-based switching. The waterfall actually has timed disable windows (anthropic disable on low-credit L3433, 30 min; openai disable on network error L3479, 10 min) and a fast-path Gemini for low-effort turns. It's already proactive-ish. The missing piece is route-distribution telemetry (finding #1 above), not a refactor.

### D. The "9 services" framing undercounts the actual decomposition
Round 8 talks about "9 services" repeatedly (Theme 4 — "9 services is closer to the floor than the ceiling"). The actual count is 27 TypeScript files in `functions/src/services/`. Some are small (promptCostService 78 LOC, providerExecutionService 207 LOC) and clearly extracted to bound complexity — good practice. Others are 1,000-3,700 LOC god classes. Albada's parsimony principle would say: don't ADD services, but DO split the giant ones. `llmService.ts` at 3,721 LOC has ≥80 internal functions per the symbol grep — that's not parsimony, that's a kitchen-sink.

### E. Implicit context (channel 3) is already strong
The synthesis Theme 7 (HITL + designing-AI-interfaces) treats Aria's UX as needing all three channels built out. Channel 3 is actually exemplary — `UserEnvironmentContext` carries weather/time/location with consent flag, woven into the prompt with explicit "use SUBTLY, never imply surveillance" instructions. The book's mental-health-app warning about implicit context is already heeded. The gap is channel 2 (direct manipulation), not channel 3.

### F. `voiceService` SSML handling is safer than T1.C presumes
T1.C calls out SSML injection as an output-sanitization gap. `voiceService.decorateDatesForAzureSsml` L434-503 actually escapes the entire text via `escapeXml` (L498) first, then re-injects only its OWN generated SSML tokens via a placeholder pattern. Model output cannot smuggle SSML through this path. Other voiceService paths weren't audited but the canonical decorate function is clean. T1.C is still valid for memory-writeback self-poisoning and Flutter markdown rendering, but the SSML half is mostly closed.

### G. Synthesis missed: client-trusted `userId` fallback
`index.ts` L222-227 in `generateResponse`: when `context.auth?.uid` is null, the function falls back to `data.userId` from the client payload and logs a warning. The comment says "Fallback is temporary for debugging - should require auth in production." This is a live spoofing vector and not on either Tier-1 list. The security audit may catch it under STRIDE-Spoofing — flag here in case it doesn't.

---

End audit.
