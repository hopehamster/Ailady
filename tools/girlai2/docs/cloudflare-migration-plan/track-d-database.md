# Track D — Database Migration: Firestore → Cloudflare

**Scope.** Move Aria's primary data store off Google Cloud Firestore. Pick a Cloudflare-native target. Land a sequenced cutover that keeps the live app working end-to-end during the move.

**TL;DR recommendation.** Use **Cloudflare D1** as the primary store + a **Vectorize** index for memory embeddings. Use **Durable Objects** to replace the one Firestore real-time stream Aria depends on (the chat history snapshot). D1 is the right pick for Aria's cardinality (single-digit-thousand users, ~10–50 MB/user); Neon Postgres adds a network hop without a benefit we'd actually use. The biggest single risk is the **chat real-time stream** (`ChatService._subscribeToMessages` at `lib/features/chat/chat_service.dart:132`), which today uses `Firestore.snapshots()` — there is no drop-in equivalent on D1.

---

## 1. Current Firestore data model — inventory

### Top-level collections

| Path | Doc shape | Cardinality | Write rate | Source |
|---|---|---|---|---|
| `users/{uid}` | Profile + subscription mirror + temporalContext mirror | 1 per user | low (login, subscription webhook, occasional temporal sync) | `functions/src/index.ts:364`, `:2504`, `:2582` |
| `conversations/{convId}` | One doc per chat turn (user msg OR assistant msg) | ~30–200 per user × all users → **highest-cardinality table** | ~2 writes per turn (user + assistant) | `functions/src/index.ts:385`, `:541`, `:2302` + `lib/features/chat/chat_service.dart:133` |
| `intelligentMemory/{uid}` | Single fat document (`IntelligentMemory` interface, `memoryService.ts:257`) holding coreFacts, emotionalMoments, conversationSummaries, recentContext, scoredMessages (up to 3000), openLoops, pacingProfile, sessionArc, proactiveConfig, styleProfile, personaConsistency, qualitySnapshots, weeklyTuningReports, shadowBenchmarkStats, behaviorCounters, openLoopHealth, chronology, lastUpdated | 1 per user, **doc can exceed 100 KB** | every assistant turn | `memoryService.ts:1836`, `:2089`, `:2785`+ |
| `memoryEmbeddings/{embId}` | One doc per embedded memory; fields: `userId`, `topics[]`, `importance`, `sourceType`, `createdAt`, vector (in-doc) | ~50–500 per user | episodic (write on memory extraction) | `functions/src/index.ts:2176`, `:2220` |
| `lorebookEntries/{entryId}` | Global lorebook content; `title`, `content`, `tags[]`, `triggers[]`, `priority`, `active`, `scope` | ~100s (curator-authored, global, not per-user) | rarely | `lorebookService.ts:81` |
| `conversationFeedback/{id}` | Thumbs-up/down on a message; `userId`, `messageId`, payload | ~1 per feedback event | rare | `memoryService.ts:2787` |
| `abShadowEvaluations/{id}` | Shadow-mode A/B eval log | low | rare | `memoryService.ts:2825` |
| `rate_limits/{docId}` | Per-user-per-day token/call buckets | 1 per (uid, day) | every callable invocation | `rateLimit.ts:89`, `:118` |
| `app_check_failures/{dayKey}` | Daily roll-up of App Check failures | 1 per day | low | `appCheckGate.ts:53` |
| `audit_log/{auto}` | Append-only audit trail | ~per privileged action | low | `auditLog.ts:64` |
| `route_metrics/{day}` | Daily route counters | 1 per day | every turn (counter increment) | `routeMetricsService.ts:58` |
| `harm_reports/{auto}` | User-submitted safety reports | rare | rare | `index.ts:2829` |
| `voice_cache/{sha256}` | L4 TTS cache: provider/voiceId/profileId/textSha → audio object pointer + viseme timeline + blendTimeline + hitCount | thousands as cache warms | per cache miss; cache-hit bumps `hitCount` | `voiceCache.ts:31`+ |
| `trace/{uid}/turns/{turnId}` | Per-turn observability trace; `retain` boolean drives TTL | grows with traffic; mostly retain=false (24h) | every turn | `turnTrace.ts:101` |
| `personalityProfiles/{uid}` | Persona snapshot | 1 per user | rare | `personalityService.ts:69` |
| `persona_history/{uid}/events/{eventId}` | Persona-change event log | low | rare | `personaHistory.ts:51` |
| `scheduled_dates/{dateId}` | Top-level (per firestore.rules) — unused or legacy; not seen in code grep | unknown | unknown | `firestore.rules:59` |
| `memories/{uid}/sessions/{sessionId}` | Legacy memory shape per rules; superseded by `intelligentMemory` and `memoryEmbeddings` | likely empty or legacy | none observed | `firestore.rules:46` |
| `milestones/{milestoneId}` | Top-level milestone listing per rules (separate from per-user mirror below) | unknown | low | `firestore.rules:53` |

### Subcollections under `users/{uid}`

| Subpath | Doc shape | Cardinality | Write rate | Source |
|---|---|---|---|---|
| `users/{uid}/fcmTokens/{token}` | One doc per device push token | 1–3 per user | on install/refresh | `index.ts:2035`, `:2065`, `:2112` |
| `users/{uid}/stats/relationship` | Single doc with `totalMessages`, `firstMessageAt`, `lastMessageAt`, `currentStreak`, `longestStreak`, `lastStreakDate` | 1 per user | every turn (transaction) | `milestoneService.ts:333` |
| `users/{uid}/milestones/{milestoneId}` | Each awarded milestone; `pendingDisplay`, `awardedAt`, etc. | ~10–30 per user | low (1 per award) | `milestoneService.ts:334`, indexed by `firestore.indexes.json:36` |
| `users/{uid}/relationshipMetrics/current` | Single rolling metrics doc | 1 per user | every turn | `milestoneService.ts:335`, `:465` |
| `users/{uid}/virtualDate/current` | Single active virtual-date session | 0 or 1 per user | start/end of session | `virtualDateService.ts:123`, `:135`, `:149` |
| `users/{uid}/importantDates/{dateId}` | User-saved date; `label`, `date` (YYYY-MM-DD), `category`, `recurs`, `createdAt` | ~5–30 per user | low | `userDatesService.ts:50` |
| `users/{uid}/recencyLedger/{poolName}` | L6 anti-repeat ledger; `recent: number[]` (≤16), `lastUsedAt` | ~5–10 pool docs per active user; 7-day TTL hygiene | every variance-pool pick | `recencyTracker.ts:42`, `:225` |
| `users/{uid}/ariaOpinions/{topic}` | Aria's evolving opinion entries | ~5–20 per user | rare | `ariaInnerLifeService.ts:469`, `:517` |
| `users/{uid}/userSecrets/{secretId}` | Confessions Aria is "holding" | low | rare | `ariaRelationshipService.ts:497` |
| `users/{uid}/gifts/{giftId}` | Aria-generated gift history | low | episodic | `index.ts:2407` |
| `users/{uid}/data/**`, `users/{uid}/subscription/**` | Misc per-rules; mostly unused / migrating to root | low | low | `firestore.rules:8`, `:12` |

### Compound indexes in use (`firestore.indexes.json`)

1. `conversations` × `(userId ASC, isFromUser ASC, createdAt DESC)` — drives mood summary + assistant-only history fetches
2. `memoryEmbeddings` × `(userId ASC, createdAt DESC)` — drives `getUserMemories` recency window
3. `milestones` × `(pendingDisplay ASC, awardedAt ASC)` — drives "show me unviewed awards"

These three become required SQL indexes on Day 1.

### Estimated data volume

- Per active user steady state: ~20–80 KB user/profile, ~50–400 KB conversations (assuming history retained), ~20–80 KB intelligentMemory doc, ~5–20 KB memoryEmbeddings, ~5–20 KB ledgers/dates/etc. → **~150 KB–600 KB per active user**.
- Globally hot: `voice_cache` and `trace` are write-heavy but mostly disposable.
- At 10,000 active users: ~3–6 GB primary + a few hundred MB of cache/trace. **Well within D1's 10 GB-per-DB ceiling** with headroom.

---

## 2. Target DB choice — D1 vs Neon Postgres

| Axis | Cloudflare D1 | Neon Postgres |
|---|---|---|
| **Engine** | SQLite (libSQL fork via Workers) | Postgres 16 |
| **Topology** | Bound directly to Workers; primary region with read replicas at edge ("Sessions API" for read-after-write) | Separate compute pool over HTTP/wire protocol; Workers reach via `@neondatabase/serverless` driver |
| **Latency from Workers** | Sub-ms for primary region; single-digit ms for edge reads via Smart Placement | 20–80ms typical from Workers (cold-start of TCP + auth round-trip) |
| **Max DB size** | 10 GB per DB; multi-DB sharding pattern beyond that | Branchable, scales to terabytes |
| **Pricing** | Workers Paid tier includes generous D1 rows-read/written; predictable | Free tier exists; metered compute hours beyond |
| **Transactions** | Yes (SQLite local) | Yes (full Postgres) |
| **Real-time subscriptions** | None native — Durable Objects fill this role | `LISTEN/NOTIFY` exists but doesn't traverse the Workers driver cleanly |
| **Vector search** | No (use Cloudflare Vectorize alongside) | `pgvector` extension on Neon |
| **Schema migrations** | `wrangler d1 migrations` — SQL files in repo, applied per env | `prisma migrate`, `drizzle-kit`, or raw SQL |
| **Backups** | Time Travel (point-in-time within 30 days) baked in | Branching = cheap point-in-time copies |
| **Operational model** | Same wrangler/Workers tooling as everything else in this migration | Separate vendor account, separate billing, separate IAM |

### The mental-model match

Firestore's denormalized "fat document" model (e.g. `intelligentMemory/{uid}` carries 18 distinct shapes inside one document) does not map cleanly to either engine. We have to normalize regardless. Given that:

- **D1 wins on integration cost.** Same `wrangler` flow, same secret store, same observability surface, same bindings (`env.DB.prepare(...)`). Aria has at most low-thousands of active users for the foreseeable future. We're not near 10 GB.
- **Neon would win if** we needed `pgvector` co-located with the OLTP store, or if we expected to outgrow 10 GB inside the migration horizon. Neither holds.
- **Vectorize (Cloudflare's vector DB) replaces `memoryEmbeddings`** more naturally than pgvector would. It binds the same way (`env.VECTOR_INDEX`) and the query semantics are simpler than raw `<=>` ops in Postgres.

**Recommendation:** D1 primary + Vectorize for embeddings + Durable Objects for chat realtime.

If we later need true Postgres power (geo queries, JSONB-heavy analytics, full-text search), Neon goes from "wrong choice now" to "additive later" — D1 stays as the OLTP store, Neon enters as an analytics replica.

---

## 3. Target schema design

### Conventions

- All timestamps are `INTEGER` (Unix ms) — avoids SQLite's loose `DATETIME` text format and matches `FieldValue.serverTimestamp()` materialization.
- IDs that were Firestore auto-IDs become `TEXT PRIMARY KEY` populated with `crypto.randomUUID()` from the Worker.
- Arrays of primitives (`recent: number[]`, `topics: string[]`) → **`TEXT` column carrying JSON**, validated at write time.
- Sub-objects with fixed shape but no independent query needs (e.g. `pacingProfile`, `sessionArc`, `proactiveConfig` inside `intelligentMemory`) → **JSON columns** on the parent row.
- Sub-objects that ARE queried independently or grow unbounded (`scoredMessages` up to 3000, `emotionalMoments`, `openLoops`, `coreFacts`, `qualitySnapshots`) → **separate child tables** with FK to `user_id`.
- All per-user tables get `INDEX(user_id, created_at DESC)` by default.

### Core DDL (top 8 tables)

```sql
-- ──────────────────────────────────────────────────────────────────────
-- 1. users — root identity + auth-adjacent profile mirror
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  uid                          TEXT PRIMARY KEY,           -- WorkOS/Auth0/Clerk subject id (see track-b-auth.md)
  email                        TEXT,
  display_name                 TEXT,
  is_subscribed                INTEGER NOT NULL DEFAULT 0, -- bool
  subscription_expires_at      INTEGER,
  last_subscription_sync_at    INTEGER,
  time_zone_offset_minutes     INTEGER,
  time_zone_name               TEXT,
  last_client_epoch_ms         INTEGER,
  last_client_sync_at          INTEGER,
  created_at                   INTEGER NOT NULL,
  updated_at                   INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────────
-- 2. conversations — every user + assistant turn
--    Replaces the top-level `conversations` collection.
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE conversations (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  is_from_user        INTEGER NOT NULL,                   -- bool
  content             TEXT NOT NULL,
  chat_mode           TEXT,
  emotion             TEXT,
  emotion_trigger     TEXT,
  emotion_intensity   REAL,
  model_used          TEXT,
  created_at          INTEGER NOT NULL,
  ts_ms               INTEGER NOT NULL                    -- mirrors the legacy `timestamp` field
);
CREATE INDEX idx_conv_user_ts        ON conversations(user_id, ts_ms DESC);
CREATE INDEX idx_conv_user_assistant ON conversations(user_id, is_from_user, created_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 3. intelligent_memory — single-row-per-user "fat doc" replacement.
--    JSON columns retain fields with no independent query path.
--    Unbounded arrays moved to child tables (see 4-7).
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE intelligent_memory (
  user_id                   TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  recent_context_json       TEXT NOT NULL DEFAULT '[]',
  pacing_profile_json       TEXT NOT NULL,
  session_arc_json          TEXT NOT NULL,
  proactive_config_json     TEXT NOT NULL,
  style_profile_json        TEXT NOT NULL,
  persona_consistency_json  TEXT NOT NULL,
  shadow_benchmark_json     TEXT NOT NULL,
  behavior_counters_json    TEXT NOT NULL,
  open_loop_health_json     TEXT NOT NULL,
  chronology_json           TEXT NOT NULL,
  last_updated              INTEGER NOT NULL
);

-- ──────────────────────────────────────────────────────────────────────
-- 4. core_facts — promoted out of intelligent_memory.coreFacts[]
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE core_facts (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN
                  ('personal','relationship','preference','life_event','important_person')),
  fact          TEXT NOT NULL,
  context       TEXT,
  confidence    REAL NOT NULL,
  extracted_at  INTEGER NOT NULL
);
CREATE INDEX idx_core_facts_user ON core_facts(user_id, extracted_at DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 5. emotional_moments / open_loops / scored_messages / conversation_summaries
--    All same template: id, user_id, payload columns, timestamps.
--    DDL elided here; pattern identical. open_loops needs:
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE open_loops (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  topic               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('open','resolved')),
  priority            REAL NOT NULL,
  freshness_score     REAL NOT NULL,
  refresh_count       INTEGER NOT NULL DEFAULT 0,
  created_at          INTEGER NOT NULL,
  last_mentioned_at   INTEGER NOT NULL,
  resolved_at         INTEGER,
  expires_at          INTEGER
);
CREATE INDEX idx_loops_user_status ON open_loops(user_id, status, priority DESC);

-- ──────────────────────────────────────────────────────────────────────
-- 6. milestones — per-user awarded milestones
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE milestones (
  id               TEXT NOT NULL,
  user_id          TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  pending_display  INTEGER NOT NULL DEFAULT 1,
  awarded_at       INTEGER NOT NULL,
  payload_json     TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX idx_milestones_pending ON milestones(pending_display, awarded_at);

-- ──────────────────────────────────────────────────────────────────────
-- 7. relationship_stats + relationship_metrics — singletons per user
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE relationship_stats (
  user_id            TEXT PRIMARY KEY REFERENCES users(uid) ON DELETE CASCADE,
  total_messages     INTEGER NOT NULL DEFAULT 0,
  first_message_at   INTEGER,
  last_message_at    INTEGER,
  current_streak     INTEGER NOT NULL DEFAULT 0,
  longest_streak     INTEGER NOT NULL DEFAULT 0,
  last_streak_date   TEXT
);

-- ──────────────────────────────────────────────────────────────────────
-- 8. recency_ledger — L6 anti-repeat state
-- ──────────────────────────────────────────────────────────────────────
CREATE TABLE recency_ledger (
  user_id        TEXT NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  pool_name      TEXT NOT NULL,
  recent_json    TEXT NOT NULL DEFAULT '[]', -- bounded 16 numbers
  last_used_at   INTEGER NOT NULL,
  PRIMARY KEY (user_id, pool_name)
);
CREATE INDEX idx_recency_ttl ON recency_ledger(last_used_at);
```

Secondary tables that follow the same pattern (DDL omitted for brevity): `voice_cache` (PK = sha256 key, columns mirror current doc fields), `fcm_tokens`, `important_dates`, `virtual_date_sessions`, `aria_opinions`, `user_secrets`, `gifts`, `lorebook_entries`, `conversation_feedback`, `ab_shadow_evaluations`, `rate_limits`, `audit_log`, `route_metrics`, `harm_reports`, `personality_profiles`, `persona_history_events`, `turn_traces`.

### Vectorize (separate from D1)

Replace `memoryEmbeddings` entirely:

- Index name: `aria-memory-embeddings`
- Dimensions: whatever OpenAI `text-embedding-3-small` produces (1536) — verify against current `memoryEmbeddings` payload before migration
- Metadata stored alongside vector: `userId`, `topics[]`, `importance`, `sourceType`, `createdAtMs`
- Query path: `env.VECTOR_INDEX.query(queryVec, { topK: 20, filter: { userId: '...' } })`
- The legacy `getUserMemories` recency query becomes a pure D1 query against a small `memory_embedding_meta` table keyed by Vectorize vector id, OR we keep that recency view inside Vectorize's metadata and avoid the join.

---

## 4. Migration strategy — sequenced

### Phase 1 — Stand up D1 + DAL (week 1)

- Provision D1 DB (one prod, one staging) via `wrangler d1 create aria-prod`
- Provision Vectorize index `aria-memory-embeddings`
- Commit the migrations under `functions/migrations/` (or `worker/migrations/` if Track C renames)
- Build a DAL module (`worker/src/dal/`) with one file per logical entity: `users.ts`, `conversations.ts`, `intelligentMemory.ts`, `milestones.ts`, `recencyLedger.ts`, `voiceCache.ts`, etc.
- Each DAL function mirrors a Firestore call but uses `env.DB.prepare(...)` against D1
- Local emulator: `wrangler dev` with `--persist-to .wrangler/state` gives a SQLite file that mirrors prod schema

### Phase 2 — Dual-write (week 2–3)

- Refactor every `db.collection(X).add(...)` / `.doc(Y).set(...)` call site to ALSO call the matching DAL function
- Dual-write order: Firestore first (current source of truth), then D1 (best-effort, never fails the user path). Errors logged to existing telemetry
- Reads still come from Firestore — D1 is shadow
- Add an `assertDualWriteParity` Worker route (auth-gated) that picks a uid and diffs the Firestore vs D1 view of that user's data. Run nightly against a sample
- Real-time chat (`chat_service.dart:132`) still subscribes to Firestore in this phase

### Phase 3 — Backfill (week 4–5)

- One-shot Worker (or local node script) walks Firestore collections and writes to D1
- Order: `users` first (FK target), then `conversations` (largest), then `intelligentMemory`, then everything else
- Use Firestore's `listDocuments()` + page-by-1000; insert into D1 via batched `INSERT INTO ... VALUES (?), (?), ...`
- For `voice_cache` and `recencyLedger`: **skip backfill**. Both regenerate within days. Empty starting state is fine
- For `trace`: backfill only `retain=true` records (already a small subset)
- For `memoryEmbeddings`: re-embedding is expensive; lift each row's vector + metadata as-is into Vectorize via `env.VECTOR_INDEX.upsert([{ id, values, metadata }])`. Don't re-call OpenAI
- Backfill script writes a `migration_progress` row tracking last cursor per collection so resumability is built in
- Run a final reconciliation: count(Firestore) vs count(D1) per table, hash a sample row from each collection

### Phase 4 — Flip reads (week 6)

- One feature flag per read path (`USE_D1_FOR_X`). Each defaults to false
- Flip them on in dependency order: lookups that don't feed user-visible state first (rate limits, traces), then memory reads, then conversations
- For each flipped flag: monitor for 6–24 hours, then move to the next
- **Chat snapshot read (Flutter `chat_service.dart:132`) is the last to flip.** See Section 5
- Keep dual-write for 24–48 hours past the last flip as a safety net

### Phase 5 — Stop writing to Firestore (week 7)

- Once every read flag has been on for 48h with zero parity drift, remove the Firestore write half of each DAL call
- Coordinate with Track B (auth) + Track C (compute) so the Firebase Admin SDK can finally be removed from `functions/package.json`
- Wait for the other tracks to finish, then run the Firebase project shutdown checklist

---

## 5. Code-shape changes

### Pattern translation table

| Firestore | D1 / Workers |
|---|---|
| `admin.firestore().collection('users').doc(uid).get()` | `const row = await env.DB.prepare('SELECT * FROM users WHERE uid = ?').bind(uid).first<UserRow>()` |
| `db.collection('conversations').add({...})` | `const id = crypto.randomUUID(); await env.DB.prepare('INSERT INTO conversations (id, user_id, ...) VALUES (?, ?, ...)').bind(id, uid, ...).run()` |
| `.where('userId','==',uid).orderBy('createdAt','desc').limit(20)` | `'SELECT * FROM conversations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'` |
| `runTransaction(async tx => ...)` (`milestoneService.ts:337`) | D1 transactions via `env.DB.batch([stmt1, stmt2])` — atomic on commit |
| `FieldValue.serverTimestamp()` | `Date.now()` from the Worker (Workers clock is fine; D1 is single-region primary) |
| `FieldValue.increment(1)` (`voiceCache.ts:175`) | `'UPDATE voice_cache SET hit_count = hit_count + 1, last_used_at = ? WHERE key = ?'` |
| `FieldValue.serverTimestamp()` + `{ merge: true }` | `INSERT ... ON CONFLICT(pk) DO UPDATE SET ...` |
| `userRef.listCollections()` + recursive delete (`index.ts:2600`) | Single `BEGIN; DELETE FROM ... WHERE user_id = ?; ... COMMIT;` per dependent table. Or use ON DELETE CASCADE on the FKs and just `DELETE FROM users WHERE uid = ?` |
| `intelligentMemory.update({ field: value })` mid-mutation | Either re-serialize the JSON columns or split fields into proper columns (recommended in the schema above) |

### The chat real-time stream — the hard one

The Flutter client at `lib/features/chat/chat_service.dart:132` opens a `snapshots()` stream against `conversations` filtered by `userId` and ordered by `timestamp` desc. New documents flow through automatically. **D1 has no equivalent.** Three options:

1. **Durable Object per user** — A `ChatRoom` DO owns the canonical message log for one user. Writes go to it via Worker fetch; it persists to D1 and broadcasts to any open WebSocket clients. Flutter connects via WebSocket and receives `{type: 'append', message: {...}}` frames. Closest to the current UX; meaningful work (~3–5 days). Recommended.
2. **Server-sent events (SSE)** — Worker holds an SSE stream open per logged-in client. On message write, a pub/sub broker (KV polling, or a `BROADCAST` queue) wakes the SSE handler. Simpler than DO but degrades on disconnects.
3. **Client polling** — Flutter polls `GET /messages?since=<lastSeenMs>` every 1.5–3s. Trivial to ship, ~250–500ms perceived lag added. Acceptable if voice latency dominates anyway; not great for a chat experience.

**Recommendation:** Durable Objects. Document this in Track C so the Worker plan accounts for the DO binding.

### Transactions

Firestore transactions (`milestoneService.ts:337`) had to be retry-aware because of optimistic concurrency. D1 transactions via `db.batch([...])` are atomic and don't retry — simpler. The code review pass should look for any "transaction body that depends on read results" and rewrite as a single batched UPSERT where possible, or as `BEGIN IMMEDIATE; SELECT; UPDATE; COMMIT;` where read-modify-write semantics are required.

---

## 6. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Chat real-time stream regression** — Flutter UX feels broken with polling | High if we choose polling, low if DO | High | Build the Durable Object path. Spend a half-day on a feature-flagged polling fallback so we can ship if DO work slips |
| **Backfill data corruption** — duplicate keys, lost fields, type coercion bugs | Medium | High | Write the backfill to a STAGING D1 first. Run `assertDualWriteParity` for 1000 sampled uids before touching prod. Use Time Travel as the rollback knob |
| **Hot single-user write contention on `intelligent_memory`** — every assistant turn rewrites the whole row | Medium | Medium | The schema above already split the unbounded arrays out. The remaining JSON columns are small and rewriting them is cheap. Measure under load before launch |
| **D1 row size limit** — SQLite can store huge BLOBs but per-row writes carry the whole row to disk | Low at our scale | Medium | The hottest row (`intelligent_memory`) is ~2–8 KB once arrays are extracted. Fine |
| **Vectorize cost / latency surprise** — embeddings query cost scales with topK × queries × users | Low | Medium | Monitor `getUserMemories` calls/day during dual-write phase. Vectorize free tier covers Aria's volume; the paid tier is still cheaper than Firestore vector workarounds |
| **Firestore write volume exceeds D1 free-tier writes during dual-write window** | Medium | Low (just bills) | Add a kill switch on the D1 half of each DAL call so we can disable D1 writes per-table if we hit a quota wall. Workers Paid + D1 paid is required anyway |
| **Query patterns we missed in inventory** | Medium | Medium | Run a 7-day grep + log sample on the live functions before declaring schema final. Any unindexed query path triggers a schema-amendment migration before Phase 4 flip |
| **`intelligent_memory.scoredMessages` array of 3000 entries** — backfill row size | Low (we'll extract to child table) | Medium | The schema moves `scoredMessages` to a `scored_messages` child table. Bulk-insert in batches of 500 |
| **Lorebook is global, not per-user** | n/a | n/a | Flag at deploy: lorebook DDL has no `user_id` FK. Use `scope` column instead. Already in the schema design |

---

## 7. Effort estimate (solo developer)

- **Week 1** — Schema + DAL skeleton + local D1 spinup: 4–5 days
- **Week 2–3** — Dual-write integration across all call sites + parity assertion: 7–10 days. Largest variable: `memoryService.ts` has 11 Firestore call sites and dense per-field logic
- **Week 4–5** — Backfill scripts + reconciliation passes + Vectorize import: 5–7 days. Backfill itself runs overnight; the script-writing is most of the work
- **Week 6** — Read-flag flips + Durable Object chat path + Flutter client refactor on `chat_service.dart`: 5–7 days
- **Week 7** — Cleanup + Firestore writes off + Firebase project shutdown coordination: 2–3 days

**Total: ~25–35 working days** for one developer, assuming the other tracks (auth, compute, storage, aux) are progressing in parallel without blocking. This is the longest of the five tracks and the one most likely to slip.

---

## 8. Open questions for the owner

1. **Chat history horizon.** Do we backfill every conversation message ever written, or do we cut at the 90-day mark and archive older messages to R2 as JSON dumps? Affects backfill size and migration speed by an order of magnitude.
2. **Chat real-time UX bar.** Is sub-second message arrival a requirement (→ Durable Object) or is 1.5–3 second polling acceptable (→ ship faster, simpler)? My recommendation is DO, but the cost is ~3–5 days.
3. **Voice cache deletion policy.** Today `voice_cache` is keyed by SHA256 of the request — does the migration preserve cache entries, or is it acceptable to start with a cold cache and accept 1–2 weeks of higher ElevenLabs spend?
4. **Lorebook ownership going forward.** Is the lorebook still maintained globally, or moving to per-user authored content? Changes whether `lorebook_entries` gets a `user_id` FK.
5. **`memoryEmbeddings` cardinality.** Roughly how many embeddings per user does the production DB carry today? Sets the Vectorize tier we provision in Phase 1.

---

## Cross-references

- Track A — R2 storage: voice audio object paths reuse `audioBucket` + `audioObjectName` columns on `voice_cache` and must align with the R2 bucket naming chosen in `track-a-r2-storage.md`
- Track B — Auth: `users.uid` must accept the identity-provider subject id format chosen in `track-b-auth.md`
- Track C — Compute (Workers): the DAL lives in the Worker; the Durable Object for chat realtime is a Workers concept; the migration cutover order depends on Track C's deploy sequence
- Track E — Aux services: `route_metrics`, `audit_log`, `trace`, App Check counters are all addressed here but downstream consumers (analytics, observability) need to know the new shape
