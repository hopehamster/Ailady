# Memory Durability Classification — issue #16 (2026-07-01)

Closes the Phase-0 false-confidence gap: every exported memory WRITE path is now
classified **durable**, **explicit unsupported internal**, or **removed**.
Ownership rule (unchanged, per `ops/aria/protocols/brain-decouple-playbook.md`):
**the Worker owns all persistence I/O** (D1 for structured memory + chat log,
Qdrant for semantic vectors); `@aria/aria-core` stays pure — its memory
contribution is transforms and best-effort HTTP-side semantic calls.

Contract test: `packages/aria-core/test/memory-durability.test.ts`.

## Classification table

### DURABLE — the real write path (launch-critical)

| API | Module | How it's durable |
|---|---|---|
| `applyTurnToMemory` | aria-core `memoryService` | Pure per-turn transform; the Worker persists the result atomically via `persistTurnAndMemory` (one D1 batch = one transaction). Deterministic ids (`${turnId}_user` / `${turnId}_ai`) + replay guard make retries idempotent. |
| `createEmptyIntelligentMemory` | aria-core `memoryService` | Pure first-turn base; Worker persists it with the turn. |
| `extractTurnMemory` | aria-core `memoryService` | LLM scoring/fact/emotion extraction (no I/O itself); output is folded into `applyTurnToMemory` and persisted by the Worker. Best-effort — degrades to neutral scoring. |
| `indexSemanticMemoryForTurn` | aria-core `memoryService` | Writes vectors to **Qdrant Cloud** directly (deterministic UUIDv5 point ids → retried turns upsert). Graceful no-op when `QDRANT_URL`/`QDRANT_API_KEY` unset. Best-effort by design. |
| `deleteSemanticMemoryForUser` | aria-core `memoryService` | Qdrant uid-filtered delete (GDPR erasure). Returns `true` when unconfigured (nothing stored), `false` only on a reachable-but-failed delete. |
| `ensureUser`, `persistTurn`, `persistTurnAndMemory`, `banUser`, `deleteAllUserData` | worker `memory.ts` | Direct D1 writes; `persistTurnAndMemory` + `deleteAllUserData` are single-batch atomic. Schema verified by issue #4 (migrations 0001–0003, `pnpm -C apps/worker db:migrate:local`). |

These are exactly the memory functions exported from the `@aria/aria-core`
barrel (`src/index.ts`). **The package-public surface contains no stubs.**

### EXPLICIT UNSUPPORTED — internal no-ops with a once-per-isolate warning

Not exported from the barrel; only internal `llmService` compatibility paths
call them. Each now logs `memory.unsupported_api` /
`historyCompaction.unsupported_api` (once per isolate) and returns a documented
inert value — no silent false confidence.

| API | Inert return | Why unsupported / path to durable |
|---|---|---|
| `getIntelligentMemory` | `null` | Worker loads from D1 (`compileIntelligentMemory`) and injects memory into the brain; the legacy self-load never applies. |
| `updateIntelligentMemory` | resolves | Superseded by `applyTurnToMemory` + Worker `persistTurnAndMemory`. Kept only as llmService's default `updateMemoryInBackground`. |
| `recordResponseFeedback` | `{ success: false }` | Feedback votes need a Worker endpoint + D1 write (issues #13/#17 territory — deliberately not invented here). `updateStyleProfileFromFeedback` stays pure for that rewire. |
| `recordShadowEvaluation` | resolves | Shadow A/B benchmarking is telemetry, launch-deferred. |
| `updateProactiveConfig` | `null` | Proactive messaging is launch-deferred (`proactiveConfig.enabled` defaults false). Durable version = Worker endpoint writing `proactive_config_json`. |
| `markProactiveSent` | resolves | Companion of the above. |
| `maybeCompactHistoryInBackground` | `null` | History compaction has no summary store in the web build AND is flag-gated OFF (`HISTORY_COMPACTION_ENABLED`, default false). Enabling the flag without a store now warns instead of silently dropping summaries. |
| `saveHistorySummary` | resolves | Same. |
| `loadHistorySummary` | `null` | Same (consume side). |

### REMOVED

| API | Why |
|---|---|
| `generateWeeklySummary` (aria-core `memoryService`) | Phase-0 stub that always returned `null`; **zero callers** anywhere in the workspace. Deleted 2026-07-01. |

### Known dead private code (documented, left in place)

The private weekly-tuning chain in `memoryService.ts`
(`generateWeeklyTuningReportWithModel`, `buildWeeklyTuningFallback`,
`computeWeeklyQualityMetrics`, `pickPreviousWeekRange`) is currently
unreachable — `applyTurnToMemory` intentionally dropped the legacy
weekly-tuning block. Not exported, no false confidence; delete or rewire when
weekly tuning is scheduled.

## Launch-critical vs deferred

**Launch-critical (all durable today):**
- Per-turn conversation log + structured memory: `chat_turns`,
  `intelligent_memory`, `scored_messages` in D1, written atomically per turn.
- Semantic indexing + recall via Qdrant (best-effort; app degrades gracefully).
- Right-to-erasure (`deleteAllUserData` + `deleteSemanticMemoryForUser`) and
  data export (`exportAllUserData`).
- Tampering ban (`banUser`, `getUserBan`).

**Deferred (explicitly unsupported until their own issues land):**
- Response-feedback persistence (thumbs up/down → style profile) — needs a
  Worker endpoint (#13/#17 scope).
- Proactive messaging config + send stamps.
- Shadow A/B evaluation persistence.
- History compaction summary store (flag OFF).
- Weekly summaries / weekly relationship tuning reports.

## Notes for the lead

- **No `packages/shared-types/src/index.ts` export changes required** — the
  classification introduced no new shared types.
- `apps/worker/src/index.ts` untouched (owned by another agent); it already
  uses only the durable barrel APIs.
