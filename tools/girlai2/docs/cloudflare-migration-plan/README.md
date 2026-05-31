# Aria → Cloudflare Migration — Master Plan

**Written:** 2026-05-31. Synthesizes 5 parallel track-specific plans into a single sequenced roadmap.

**Why this migration:** off Google Cloud / Firebase. Billing surprises (the $290 May bill that blocked deploys) and Google's pattern of sweeping policy changes are not tolerable for a solo-founder app. Cloudflare's pricing is predictable, R2 has zero egress fees (huge for voice audio), and the rest of the stack composes cleanly.

**Top-line shape:** 6 calendar weeks of focused work for solo dev, runnable in parallel with continued feature shipping for most of it. Heaviest single track is Track D (database) at 25-35 working days. Lightest is Track E (aux) at 4-5.

---

## The 5 tracks at a glance

| Track | What | Choice | Effort | Top risk |
|---|---|---|---|---|
| **A — Storage** | Firebase Storage → R2 | Public R2 + custom domain via S3-compat API | 12-18h over 8 days | L4 `voice_cache` docs encode GCS hostname implicitly — need backward-compat hostBase field |
| **B — Auth** | Firebase Auth → Clerk | Clerk managed (preserve UIDs via Clerk `external_id`) | 12-15d over 4-5 weeks | `clerk_flutter` phone-OTP UX may need WebView captcha fallback |
| **C — Compute** | Firebase Functions → Workers | Workers + `nodejs_compat`; Azure Speech SDK → REST | 29-38d over 5 phases | Azure Speech SDK is Node-only (use REST + accept Azure-fallback viseme loss) |
| **D — Data** | Firestore → D1 + Vectorize + DOs | D1 (fits 10GB ceiling); Vectorize replaces `memoryEmbeddings`; Durable Object per user for chat realtime | 25-35d over 7 weeks | Chat realtime — Firestore snapshots have no D1 equivalent; DO route adds 3-5d |
| **E — Aux** | Crashlytics / Analytics / App Check / FCM | Sentry / PostHog (or defer) / Turnstile (defer) / Workers→APNs+FCM direct | 4-5.5d total | Push token re-registration: ALL users re-register on first post-cutover launch |

Plans live alongside this README:
- [`track-a-r2-storage.md`](./track-a-r2-storage.md)
- [`track-b-auth.md`](./track-b-auth.md)
- [`track-c-compute-workers.md`](./track-c-compute-workers.md)
- [`track-d-database.md`](./track-d-database.md)
- [`track-e-aux-services.md`](./track-e-aux-services.md)

---

## Critical sequencing dependency

**Track C Phase 2 (LLM callables) hard-depends on Track D Phase 2 (dual-write).** 22 `admin.firestore()` callsites in `index.ts` + 9 services bound to firebase-admin block the Workers port until the D1 client surface is stable.

**Track B has a soft dependency on Track C** — Clerk session tokens don't satisfy Firestore Rules; during the parallel window we mint Firebase custom tokens from verified Clerk tokens to keep Rules working. Once Track C ships and Firestore is gone, this disappears.

**Track A is fully independent** — R2 swap touches only `voiceService.ts` and `voiceCache.ts`. Can ship Week 1 standalone.

**Track E is fully independent** — Crashlytics + push token swaps are leaf concerns.

---

## Recommended phase plan

```
Week 1   ┌─ A: provision R2, dual-bucket env-flag, soak ──────┐
         └─ E1: Sentry swap-in (Crashlytics out) ─────────────┘
Week 2   ┌─ A: flip env to R2-only, backfill voice_cache ─────┐
         ├─ D1: stand up DB, define schemas, write DAL ───────┤
         └─ B1: Clerk provision + phone-OTP spike on scratch ─┘
Week 3   ┌─ D2: dual-write (Firestore + D1) ──────────────────┐
         ├─ C1: port pure-logic modules to a Worker, verify ──┤
         └─ B2: dual-auth — Clerk alongside Firebase ─────────┘
Week 4   ┌─ D3: backfill historical users/messages ──────────┐
         ├─ C2: port LLM callables (needs D1 reads) ─────────┤
         └─ E2: push (Workers→APNs+FCM direct) ──────────────┘
Week 5   ┌─ D4: flip reads to D1, keep dual-write 48h ───────┐
         ├─ C3: port voice callable (Azure REST, ElevenLabs) ┤
         └─ B3: flip Flutter auth surface, JWT verify ───────┘
Week 6   ┌─ D5: stop Firestore writes ───────────────────────┐
         ├─ C4: port aux callables + triggers ───────────────┤
         └─ Cutover dress rehearsal on a scratch user ──────┘
Week 7+  Decommission Firebase project; monitor Sentry + Workers
         tail for two weeks; cancel Google billing.
```

Caveats:
- The realtime-chat Durable Object work in Track D may bleed into Week 4-5 if the polling fallback is unacceptable.
- App Check parity (Turnstile in Workers) is deferred until after cutover — App Check isn't actually enforced in production today per Track E recon.

---

## Consolidated top 5 risks (across all tracks)

1. **Azure Speech SDK is Node-only.** Workers can't run it. Mitigation: call Azure REST `/cognitiveservices/v1` directly; accept viseme loss on Azure-fallback path (ElevenLabs primary already uses approximated visemes).
2. **Realtime chat has no D1 equivalent.** Mitigation: Durable Object per user for sub-second message arrival OR client polling (latency tradeoff).
3. **L4 `voice_cache` ties cache docs to GCS hostname implicitly.** Mitigation: add optional `audioHostBase` field — backward-compatible.
4. **`clerk_flutter` phone-OTP UX may regress vs Firebase silent path.** Mitigation: Week 1 spike on a scratch Flutter project; pivot to Better-Auth if blocked (+1 week).
5. **Push token re-registration churn.** ALL users re-register on first post-cutover launch. Mitigation: force `getToken()` ignoring cache + monitor pickup rate.

---

## Open questions for the owner

Across all 5 tracks, these are the decisions only you can make:

1. **Chat history horizon** — preserve all historical messages or start from a cutoff date? Affects backfill time + cost in Track D.
2. **Voice cache fate during R2 cutover** — copy the hot cache (preserve hits) or accept a one-time reset (simpler)? Track A.
3. **R2 custom domain** — pick a subdomain (e.g. `voice.aria.app`) on Day 1. Track A blocks otherwise.
4. **Cloudflare account isolation** — single account for Aria or separate from other workloads (Sifter, Pro Se)?
5. **Analytics: PostHog or defer?** — Track E recon found AnalyticsService is wired but ~zero events are actually fired. You could skip analytics entirely until product-market fit.
6. **Realtime chat UX bar** — Durable Object (sub-second, +3-5d work) or polling (2-5s latency, no extra work)? Track D.
7. **Clerk vs Better-Auth** — Clerk is recommended for managed simplicity; Better-Auth saves $0-25/mo. Worth $25/mo to skip self-host ops? Track B.
8. **Sentry free vs paid tier** — free covers solo testing; paid is $26/mo for 50K events. Defer.

---

## Recommended first move

**Ship Track A (R2 storage) Week 1 as a standalone win.** It's the lowest-risk, highest-savings move, fully independent of all other tracks, and lets you verify the cost delta on real audio traffic before committing to the heavier pieces. Effort: 12-18 hours over 8 days, mostly attended monitoring.

You'll need:
- The Cloudflare API token (90-day, scoped per the recommendations) — being generated now
- A subdomain choice for the public R2 bucket (e.g. `voice.aria.app`)
- A decision on cache hot-data fate at cutover

Once R2 is live, kick off **Track D Week 2** (database stand-up) and **Track B Week 2** (Clerk phone-OTP spike) in parallel — those are the long poles. Track C waits for D's dual-write to land.
