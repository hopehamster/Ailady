# Track A: Audio Storage Migration — Firebase Storage → Cloudflare R2

**Status:** Planning. No code changes proposed.
**Owner:** Mike
**Target:** Migrate ElevenLabs/Azure voice MP3 uploads off GCS bucket `girlai2-voice-audio` onto Cloudflare R2.
**Why this track first:** Highest single cost win (GCS egress at $0.12/GB → R2 egress at $0), lowest blast radius (storage is a leaf concern), and storage can run dual-write for safe rollback.

---

## 1. Current state inventory

### Where audio is uploaded
- **Entry point:** `functions/src/services/voiceService.ts` — `uploadAudioToStorage()` at **line 2023**.
- **Caller:** `prepareAudioDelivery()` at **line 2149**, which inlines tiny (≤1 MB) audio as base64 and uploads larger files to GCS.
- **Callers of `prepareAudioDelivery`** (3 sites):
  - line 1654 — Azure path
  - line 1764 — Azure REST fallback path
  - line 1900 — ElevenLabs path
- **Object key format:** `voice/{provider}/{uuidv4()}.mp3` (line 2107). Provider is `azure` or `elevenlabs`.
- **Bucket resolution:** `resolveVoiceBucketCandidates()` (line 197) walks env-configured `VOICE_AUDIO_BUCKET` → `fallbackVoiceBucket = 'girlai2-voice-audio'` (line 99). `getVoiceBucketOverride()` at line 194. `.env.girlai2` defines `VOICE_AUDIO_BUCKET`.

### How signed URLs are generated
- **They are not.** The bucket has IAM `allUsers:objectViewer` (public-read). The upload returns the plain public URL:
  - `https://storage.googleapis.com/{bucket}/{filename}` (lines 2046, 2143).
- **Why no signing:** comment at line 2044 — *"Avoids `iam.serviceAccounts.signBlob` requirement on the Cloud Functions SA."*
- **Operational implication:** all voice audio is publicly readable by any URL holder. Privacy posture today is "obscure UUID = sufficient." Confirmed identical pattern in `voiceCache.ts` at `buildPublicAudioUrl()` (line 116).

### Where signed URLs are consumed (Flutter)
- `lib/features/chat/screens/chat_screen.dart` line **311** — `await _audioPlayer.setUrl(voiceResult.audioUrl)`.
- Inline base64 path (lines 302-309) handles small files in-memory via `_MemoryAudioSource` — unaffected by storage migration.
- `just_audio` plugin treats the URL as opaque; any reachable HTTPS URL works.

### Cache integration points (L4 voice_cache)
- `voiceCache.ts` Firestore docs in `voice_cache/{sha256}` store `audioBucket` + `audioObjectName` (lines 239-240).
- On hit, `lookupVoiceCache()` (line 126) rebuilds the URL via `buildPublicAudioUrl(audioBucket, audioObjectName)` (line 190) → `https://storage.googleapis.com/{bucket}/{objectName}`.
- **This is the migration trap:** cache docs persisted today encode the GCS hostname implicitly. After migration, the same docs need to point at R2's hostname. Two options addressed below.

### Estimated current storage cost shape
GCS Standard, multi-region US: $0.026/GB-month storage + **$0.12/GB egress**. Operations are immaterial.

| Monthly egress | GCS bill | R2 bill | Saved |
|---|---|---|---|
| 10 GB | ~$1.20 | $0 | $1.20 |
| 100 GB | ~$12 | $0 | $12 |
| 1 TB | ~$120 | $0 | $120 |
| 5 TB | ~$600 | $0 | $600 |

Storage itself is a rounding error at any plausible Aria scale (10 GB storage = $0.26/mo GCS vs $0.15/mo R2). The win is 100% egress.

---

## 2. Target state on R2

### Recommended bucket configuration
- **Name:** `aria-voice-audio` (no `girlai2` legacy prefix; clean break)
- **Jurisdiction:** auto / default — Cloudflare picks the closest data location at write time; egress is global edge-cached either way
- **Storage class:** Standard (Infrequent Access doesn't fit — voice audio is read shortly after write, often the same session)
- **Access model:** **Public bucket + custom domain** (e.g., `voice.aria.app` or `voice-cdn.<domain>`). No signed URLs.
  - Rationale: matches current GCS pattern (public-read + UUID obscurity), avoids any signing on the Functions side, and `just_audio` keeps working without changes
  - Alternative considered: presigned URLs (S3 API, max 7-day TTL). Rejected — adds signing cost on the hot path, complicates the L4 cache (URL changes per-request so the cached `audioUrl` field becomes invalid), and provides no real privacy gain over the current pattern
- **Public access:** enable via Cloudflare dashboard ("Public Access" → custom domain). Do **not** use the bare `r2.dev` public hostname for production; Cloudflare rate-limits it and discourages it for production traffic

### How writes happen from Node
- **SDK:** `@aws-sdk/client-s3` v3 (R2 is S3-compatible). Already a peer of most Node ecosystems; ~2 MB install.
- **Endpoint:** `https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
- **Auth:** R2 API token → exposes S3-compatible Access Key ID + Secret Access Key. Stored as Firebase Function params (mirrors current `VOICE_AUDIO_BUCKET` pattern).
- **Why not Workers R2 bindings:** the writer is Firebase Functions (Node), not a Worker. Bindings only work from inside Workers. S3 API is the right surface here.

### Read URL shape
After cutover: `https://voice.aria.app/voice/{provider}/{uuid}.mp3` — same path structure, different host. Encoded in code as `R2_PUBLIC_BASE_URL` env var.

---

## 3. Migration steps — sequenced

### Day 1 — Provision (Cloudflare dashboard, ~30 min)
1. Create R2 bucket `aria-voice-audio` (Standard, auto jurisdiction)
2. Create R2 API token: scope = Object Read & Write, single bucket. Save: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
3. Attach custom domain via Cloudflare DNS (e.g., `voice.aria.app`). Wait for proxied DNS + SSL.
4. Smoke test with `aws s3 --endpoint-url https://{acct}.r2.cloudflarestorage.com cp test.mp3 s3://aria-voice-audio/test.mp3` then verify reachable at `https://voice.aria.app/test.mp3`

### Day 2-3 — Dual-write code path (Functions, ~4-6h)
1. Add deps: `pnpm add @aws-sdk/client-s3` (and `@aws-sdk/lib-storage` for `Upload` helper)
2. Define new params in `voiceService.ts` next to existing `voiceAudioBucketParam` (line 97):
   ```ts
   const r2AccountIdParam = defineString('R2_ACCOUNT_ID', { default: '' });
   const r2AccessKeyIdParam = defineString('R2_ACCESS_KEY_ID', { default: '' });
   const r2SecretAccessKeyParam = defineString('R2_SECRET_ACCESS_KEY', { default: '' });
   const r2BucketParam = defineString('R2_BUCKET', { default: 'aria-voice-audio' });
   const r2PublicBaseUrlParam = defineString('R2_PUBLIC_BASE_URL', { default: '' });
   const audioStorageBackendParam = defineString('AUDIO_STORAGE_BACKEND', { default: 'gcs' }); // 'gcs' | 'r2' | 'dual'
   ```
3. Add `uploadAudioToR2()` next to existing `uploadAudioToStorage()` (line 2023). Same `AudioUploadResult` shape (`bucket`/`objectName`/`audioUrl`) so callers don't change. `bucket` = R2 bucket name; `audioUrl` = `${R2_PUBLIC_BASE_URL}/${objectName}`.
4. Branch inside `uploadAudioToStorage()` based on `AUDIO_STORAGE_BACKEND`:
   - `gcs` (default): current behavior — no behavior change for users
   - `r2`: call new R2 path only
   - `dual`: upload to both, return GCS URL (still serving GCS to clients) — sanity check that R2 writes succeed before flipping
5. **Critical:** extend the `voice_cache` doc shape with optional `audioHostBase` field. When written by GCS path, omit (rebuild via `https://storage.googleapis.com/{bucket}/{object}`). When written by R2 path, store `audioHostBase: 'https://voice.aria.app'`. `buildPublicAudioUrl()` in `voiceCache.ts` (line 116) becomes: prefer `audioHostBase` if present, else GCS pattern. Backward compatible — existing docs keep working.
6. Deploy with `AUDIO_STORAGE_BACKEND=gcs` (no behavior change), verify deploy clean.

### Day 4 — Dual mode (~10 min flip + 24h soak)
Flip `AUDIO_STORAGE_BACKEND=dual`. Every synth uploads to both. Clients still get GCS URLs. Watch logs for R2 write failures. Run for 24h.

### Day 5 — Cutover (~10 min flip + 48h soak)
Flip `AUDIO_STORAGE_BACKEND=r2`. New uploads land in R2 only. Cache writes carry `audioHostBase`. Old cache docs still resolve to GCS objects (still present). Watch error rates.

### Day 6-7 — Backfill (~6-8h, mostly waiting)
Two valid approaches; pick based on Q1 below.

**Approach A — copy hot cache entries:**
1. Query `voice_cache` collection where `lastUsedAt >= now() - 30d` and `audioHostBase == null` (i.e., GCS-era)
2. For each: download `gs://{audioBucket}/{audioObjectName}` → upload to R2 same key → patch doc with `audioHostBase`
3. Use `@google-cloud/storage` + AWS SDK in a Node script in `functions/scripts/`. Expect ~30-60 min for ~10k entries
4. Anything not touched in 30d falls through to re-synth on next miss (acceptable — cache is regenerable)

**Approach B — accept cache reset:**
1. Skip backfill entirely. Bulk-delete `voice_cache` docs lacking `audioHostBase`. Next request re-synthesizes (one-time ~$0.30/cache miss × hit rate decay)
2. Faster (5 min) but ~24-48h of degraded hit rate

### Day 8 — Decommission GCS (~30 min, **wait 14 days from Day 5 first**)
1. Confirm no cache hits resolving to GCS in logs for 7+ days
2. Snapshot bucket contents to local cold storage (just in case)
3. Set GCS bucket lifecycle: delete all objects after 1 day
4. After lifecycle runs: delete bucket. Remove `VOICE_AUDIO_BUCKET` from env, remove `getVoiceBucketOverride()` + `resolveVoiceBucketCandidates()` + `uploadAudioToStorage()` GCS branch from `voiceService.ts`.

---

## 4. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R2 write fails mid-cutover, breaking voice for live sessions | Low | High | Dual-write Day 4 catches this 24h before clients see it. Rollback = flip env var back to `gcs` (no redeploy needed if params are runtime-resolved — and they are, via `defineString` + `param.value()` at lines 158-164). |
| L4 cache docs encode GCS host, break after GCS shutdown | High if ignored | Medium | `audioHostBase` field per Step 2.5 makes old docs self-describing. Cache stays valid across migration. |
| Custom domain DNS propagation delays Day 5 cutover | Low | Low | Provision Day 1, verify resolves globally by Day 4. |
| R2 outage with no GCS fallback after Day 8 | Very low | High | Cloudflare R2 SLA is 99.9% standard tier. Aria already depends on Firebase Functions + Firestore; R2 adds a third dependency at similar reliability. Accept. If paranoid: keep GCS bucket read-only for 90 days as warm fallback (no code path uses it; just kept). |
| Public-bucket URL pattern leaks via referrer headers | Same as today | Low | Current GCS pattern has the same exposure. R2 doesn't make this worse. If a future privacy review wants signed URLs, that's a separate workstream — both backends support it. |
| Existing in-flight chat sessions during cutover get a mix of GCS and R2 URLs | Certain | None | Both hostnames are valid public URLs throughout the dual period. `just_audio` doesn't care which it loads. No client coordination needed. |
| Object key collision (two providers writing same UUID) | ~0 | None | UUIDv4 collision space is 2^122. Ignore. |
| R2 presigned URL approach later needed | Medium (privacy review) | Medium | `@aws-sdk/s3-request-presigner` slots into the same code path. URL freshness pushes us toward `audioHostBase: null` + lazy URL rebuild on each cache hit. Future work, not blocker. |

### Latency
R2 serves from Cloudflare's edge (300+ POPs). For Las Vegas dev laptop: expect ~10-30ms first-byte vs GCS ~40-80ms multi-region US. For users globally: R2 is materially better outside US-Central. No regression expected anywhere.

---

## 5. Effort estimate

- **Total engineering time (solo):** ~12-18 hours over 8 calendar days
  - Provision + smoke test: 1h
  - Dual-write code + tests: 4-6h
  - Backfill script + run: 3-4h (Approach A) or 30min (Approach B)
  - Monitoring + soak time: 4-6h of attention spread over 5 days
  - GCS decommission: 1h
- **Parallel with feature work:** yes — only the Day 2-3 coding block needs focus. Days 4-7 are mostly env-var flips + watching logs.
- **Reversibility:** **excellent through Day 7.** Single env-var flip reverts to GCS at any point. After Day 8 (GCS deleted), reversal requires restoring the bucket from snapshot — possible but 2-4h painful. The 14-day soak between cutover and decommission is the safety budget.

---

## 6. Open questions for the owner

**Q1 — Backfill strategy:** Approach A (copy hot cache, ~30-60 min runtime, ~$0 cost) vs Approach B (drop cache, re-synth on miss, ~$5-20 in ElevenLabs spend over 48h depending on volume). Recommendation: **A** unless cache size is unexpectedly huge (>100k entries).

**Q2 — Public bucket vs presigned URLs:** Plan above assumes public bucket + custom domain (matches current GCS posture). Acceptable for now? Or use this migration as the moment to also tighten to short-lived presigned URLs (adds ~5h work, slows cache-hit serving)?

**Q3 — Custom domain choice:** What hostname do you want? Options: `voice.aria.app`, `voice-cdn.<existing-domain>`, or accept the bare R2 dev URL `pub-<hash>.r2.dev` (not recommended for prod). Decision blocks Day 1 provisioning.

**Q4 — Keep GCS as warm fallback?** Plan deletes GCS bucket Day 8. Alternative: keep it 90 days as a read-only fallback (cost ~$1-3/month). Recommend: delete on Day 8; the 14-day soak is enough confidence.

**Q5 — Cloudflare account scope:** Does the existing CF account have R2 enabled and a payment method on file? R2 requires both before bucket creation. (Free tier covers 10 GB storage + 1M Class A + 10M Class B ops/mo, which Aria almost certainly stays under — so this may be $0 in practice.)

---

## Appendix — file/line reference cheat sheet

| Concern | Path | Lines |
|---|---|---|
| Bucket name fallback | `functions/src/services/voiceService.ts` | 99 |
| Bucket override resolver | same | 194-207 |
| Storage param definition | same | 97 |
| Upload entry point | same | 2023-2147 |
| Public URL construction | same | 2046, 2143 |
| Delivery branching (inline vs storage) | same | 2149-2194 |
| Cache hit URL rebuild | `functions/src/services/voiceCache.ts` | 116-118, 190 |
| Cache write persistence | same | 230-248 |
| Flutter URL consumer | `lib/features/chat/screens/chat_screen.dart` | 311 |
| Env var | `functions/.env.girlai2` | (present, `VOICE_AUDIO_BUCKET`) |
