# Track B — Authentication Migration (Firebase Auth → Replacement)

**Status:** Planning. No code changes.
**Owner:** Solo dev (Mike).
**Parallel-safe with:** Tracks A (compute), C (DB), D (storage), E (aux services).
**Recommendation:** **Clerk** for the consumer-app surface; **Better-Auth** as the fallback if Clerk's phone-OTP pricing breaks the math.

---

## 1. Current state inventory

### Auth methods enabled
**Phone-only (SMS OTP).** No email/password, no Google sign-in, no Apple sign-in, no anonymous mode.

Source: `lib/features/auth/auth_service.dart` only calls `verifyPhoneNumber` and `signInWithCredential(PhoneAuthCredential)`. The two auth UI screens are `login_screen.dart` (phone entry) and `otp_screen.dart` (6-digit code). No other sign-in paths exist in `lib/features/auth/screens/`.

**Implication:** the Apple sign-in App Store mandate does NOT apply — that rule only triggers when an app offers third-party social sign-in (Google/Facebook/etc.). Phone-only stays compliant without Sign-in-with-Apple. This widens the provider field considerably.

### Callsite counts
- **Flutter (`lib/`):** ~20 reads of `FirebaseAuth.instance.currentUser` / `getIdToken()`, concentrated in `core/services/firebase_service.dart` (13 sites: 135, 308, 376, 403, 477, 495, 512, 529, 589, 596, 646) and `core/services/important_dates_api_service.dart` (3 sites). Auth state subscription lives only in `features/auth/auth_service.dart:73` (`auth.authStateChanges().listen`).
- **Backend (`functions/src/`):** 50 references to `context.auth?.uid` across `index.ts` plus 2 in `appCheckGate.ts`. Pattern is uniform: `const userId = context.auth?.uid; if (!userId) throw HttpsError('unauthenticated', ...)`. Always extracted at the top of every callable.
- **Firestore rules:** every rule in `firestore.rules` predicated on `request.auth.uid == userId` (or `resource.data.userId == request.auth.uid` for top-level collections).

### Token verification pattern today
Firebase callable functions auto-verify the Firebase ID token before invocation and inject `context.auth = { uid, token }`. No manual verification anywhere. The Flutter SDK transparently attaches the ID token to each callable request.

### Emulator config
`lib/core/utils/emulator_config.dart` reads `FIREBASE_AUTH_EMULATOR_HOST` env var (or `--dart-define` compile-time fallback for physical Android). Auth emulator MUST be wired BEFORE `Firebase.initializeApp()` per the file's own comments — this constrains the migration shape (the replacement needs an equivalent dev-loop story).

### Active user count
Not discoverable from repo. Assume **solo testing + small private cohort (<100 users)** per task brief. All Firebase Auth pricing/import considerations are dominated by SMS cost, not MAU tiers.

---

## 2. Candidate providers — comparison

| Dimension | Clerk | Better-Auth | Cloudflare Access + custom JWT |
|---|---|---|---|
| **Pricing model** | $0 to 10K MAU + SMS pass-through (Twilio); $25/mo for next 1K MAU | $0 software; pay Cloudflare Workers + your own SMS gateway (Twilio direct) | $0 Workers ingress; pay SMS gateway; engineering time = the cost |
| **Phone OTP support** | First-class (`signIn.create({ strategy: 'phone_code' })`) | Plugin (`phoneNumber()` from `better-auth/plugins`) — beta but functional | Roll-your-own with Twilio Verify + KV-backed nonces |
| **Flutter SDK** | Official `clerk_flutter` (active, growing). Solid for OAuth; **phone-OTP support has gaps** — historically requires WebView fallback for Captcha. Verify in their tracker BEFORE committing | None. Use HTTP client + their REST API. Equivalent in line-count to Firebase phone-auth wiring | None. Equivalent to Better-Auth route |
| **Firebase Auth import** | **Yes** — Backend API `users.create` with `password_digest: 'firebase_scrypt'` (only matters if you had passwords; phone-only means you just create stub users with phone numbers) | Manual script. Read Firebase user export JSON, POST to Better-Auth `signUp.create` | Manual script |
| **Token verification on Workers** | JWT verify via JWKS at `https://<frontend-api>.clerk.accounts.dev/.well-known/jwks.json`. Verify with `jose` (Workers-compatible) | JWT verify via Better-Auth issued tokens, same `jose` flow | Custom JWT, custom JWKS, custom rotation |
| **OAuth providers** | All major. N/A for current Aria but cheap future option | All major via plugins | Build per provider |
| **Session management** | Managed (refresh tokens, multi-device, revocation UI) | Self-managed in your DB | Self-managed |
| **App Check equivalent** | Not directly equivalent (Clerk's bot protection is different shape — relies on Turnstile + their fraud signals) | None — pair with Cloudflare Turnstile | Native Turnstile integration |
| **Dev-loop / emulator** | Test mode + dev instances (free), separate tenant per env | Run locally with the existing Worker dev server (wrangler) | Same — pure code |
| **Vendor lock-in risk** | Medium — managed user database. Export API exists but it's a one-way bridge | Low — code you own; DB you own | Zero |
| **Time-to-prod** | ~1 week | ~2 weeks | ~3-4 weeks |

### Recommendation: **Clerk**

**Reasoning:**
1. **The migration risk dominates the lock-in risk for a solo dev.** Two unknowns (new stack + new auth) shipped simultaneously = much higher failure rate than (new stack + managed auth).
2. **Phone OTP cost is identical across providers** — Twilio SMS is the line item, not auth software. Clerk's MAU pricing is dwarfed by SMS spend at any meaningful scale.
3. **Token verification on Workers is well-trodden** for Clerk (`@clerk/backend` has an official Workers adapter as of 2024-2025). Better-Auth's Workers path is newer and less documented.
4. **The $25/mo at 10K MAU** is acceptable per the brief (single tier pricing philosophy, not optimizing for marginal cost).

**Caveat that could flip the recommendation:** if Clerk's `clerk_flutter` phone-OTP path requires a WebView captcha step that degrades UX vs. Firebase's silent iOS path, Better-Auth becomes more attractive (you control the SMS UX end-to-end). **Verify the current state of `clerk_flutter` phone auth before Week 1 begins** — this is the single most load-bearing assumption in this plan.

---

## 3. Migration plan — sequenced

### Week 1 — Provision + parity test
- Create Clerk app (production + dev instances).
- Configure phone-OTP as the only sign-in strategy. Connect Twilio (or use Clerk's default SMS).
- Wire `clerk_flutter` into a **scratch Flutter project** (NOT the main repo) and prove that phone-OTP works on both iOS sim + physical Android with the same UX as today.
- Document the Clerk session-token shape (it's a short-lived JWT with `sub` = Clerk user ID, separate from a "user ID" in the issuer-claim sense).
- **Gate decision:** if `clerk_flutter` phone-OTP UX is acceptable, proceed. If not, pivot to Better-Auth and add 1 week.

### Week 2 — Dual-write rails
- Keep Firebase Auth as source-of-truth.
- Add `ClerkProvider` to the Flutter app alongside `AuthService`. New `ClerkAuthService` runs in parallel.
- Backend: add a `verifyClerkToken(req)` helper in `functions/src/auth/clerkVerify.ts` using `jose` + Clerk JWKS. Do NOT remove `context.auth?.uid` extraction yet.
- New users in Week 2+ get accounts in BOTH systems (Firebase first to keep all callsites working, then mirror to Clerk).
- Note: Track A (compute migration) needs to expose the new token verification shape; coordinate the verify-helper contract.

### Week 3 — Import existing users
- Export Firebase Auth users via Admin SDK (`auth.listUsers()` → JSON).
- For each phone-only user: POST to Clerk `users.create` with `phone_number`, `external_id` = Firebase UID, `skip_password_requirement: true`.
- **Critical:** preserve the Firebase UID by writing it to Clerk's `external_id`. Backend then resolves identity via `external_id` not Clerk's internal `id`. This keeps Firestore data keyed by the same UID during the parallel window. Track C (DB migration) will need this mapping at cutover.
- Verify import by sampling 5-10 accounts — log into each via Clerk, confirm `external_id` matches the original Firebase UID.

### Week 4 — Flip the surfaces
- Flutter: swap `AuthService` injection to `ClerkAuthService`. The shape (`isAuthenticated`, `user`, `signInWithOTP`, `signOut`) stays identical; only the implementation changes. Callsites in `firebase_service.dart` that read `_auth.currentUser` get rerouted through an adapter that returns a `User`-shaped object backed by Clerk session data.
- Backend: rewrite the auth-gate pattern. Every callable's `context.auth?.uid` extraction becomes:
  ```ts
  const claims = await verifyClerkToken(req);  // throws on invalid
  const userId = claims.external_id;            // preserved Firebase UID
  if (!userId) throw new HttpsError('unauthenticated', ...);
  ```
  (Exact shape depends on Track A's Workers handler — Cloudflare Workers don't have `functions.https.onCall` middleware, so the verification will be inlined per route or via a router middleware.)
- `appCheckGate.ts` rewrites — App Check has no Cloudflare equivalent. Replace with **Cloudflare Turnstile** invisible widget on the Flutter side + Turnstile validation on Workers. Different mental model: Turnstile gates the REQUEST, App Check gates the APP. Acceptable downgrade for solo testing; revisit before scale.
- Run dual-write for one week (Clerk primary, Firebase as fallback verifier) to catch token-shape bugs.

### Week 5 — Decommission
- Remove `firebase_auth` from `pubspec.yaml`.
- Remove Firebase Auth from Functions/Workers token verification path.
- Disable Firebase Auth in the Firebase console (keep the project alive only as long as Tracks C+D need it).
- Delete `lib/core/utils/emulator_config.dart` auth-related code; replace with Clerk dev-instance config.

---

## 4. Firestore Rules + backend implications during parallel window

**During Weeks 2–4 (parallel run):** Firestore still gates on `request.auth.uid`. Clerk's session does NOT produce a `request.auth` context that Firestore Rules can read — Firestore Rules ONLY understand Firebase ID tokens. Options:

1. **Keep Firebase Auth signed in alongside Clerk.** Every Clerk login also performs a Firebase custom-token sign-in (Functions endpoint that takes a verified Clerk token and mints a Firebase custom token). Firestore Rules continue to work unchanged. **Recommended for the parallel window** — it's two API calls at login time and zero changes to Firestore Rules.
2. **Replace Firestore Rules with Worker-level auth checks.** Only viable AFTER Track C migrates DB off Firestore. Until then, option 1.

**Post-Track-C (Firestore gone):** auth checks happen in Worker handlers. Pattern per route:
```ts
const claims = await verifyClerkToken(request.headers.get('Authorization'));
const userId = claims.external_id;
// then: scope DB query by userId
```
JWKS URL: `https://<frontend-api>.clerk.accounts.dev/.well-known/jwks.json`. Cache JWKS in Workers KV with TTL. Use `jose.jwtVerify` (Workers-compatible, no Node deps).

---

## 5. Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `clerk_flutter` phone-OTP UX worse than Firebase | Medium | High (blocks migration) | Week 1 spike in scratch project before committing. Fall back to Better-Auth if blocked. |
| UID remapping breaks Firestore data | High if not handled | Catastrophic (orphaned chat history) | Use Clerk `external_id` = Firebase UID. Backend resolves identity via `external_id`. Verify with 5-10 sample imports before bulk. |
| App Check has no 1:1 Cloudflare equivalent | Certain | Medium (anti-abuse downgrade) | Replace with Turnstile. Accept the gap during solo testing; harden before public launch. |
| 2FA / session continuity at cutover | Low (phone-only is already 2FA-ish) | Low | Force re-auth on Week 4 flip. Acceptable for <100-user cohort. |
| SMS cost spike from migration testing | Medium | Low ($X for testing) | Use Clerk's test mode + test phone numbers; only use real SMS on final smoke test. |
| Anonymous/guest users break | None | None | Codebase has no anonymous-auth path. |
| App Store compliance (Apple sign-in) | None | None | Phone-only doesn't trigger the mandate. |

---

## 6. Effort estimate

- **Solo developer, focused:** 4–5 weeks calendar, ~12–15 engineering days actual.
- **Critical path:** Week 1 spike (`clerk_flutter` phone-OTP UX verification). If that fails, add 1 week for Better-Auth pivot.
- **Parallelism with other tracks:**
  - Independent of Track D (storage), Track E (aux).
  - **Soft dependency on Track A (compute):** Week 4 backend-flip needs Workers handlers stood up — coordinate the `verifyClerkToken` middleware contract early.
  - **Soft dependency on Track C (DB):** the UID-preservation strategy (Clerk `external_id` = Firebase UID) only matters if Track C is preserving UIDs in the data migration. Confirm with Track C author.

---

## 7. Open questions for the owner

1. **Preserve UIDs or remap?** Plan assumes preserve (Clerk `external_id` = Firebase UID) so Track C doesn't have to rewrite every Firestore doc's user key. Confirm this matches Track C's plan.
2. **Acceptable to drop App Check during migration?** Cloudflare Turnstile is the closest substitute. Different threat model. Solo-testing cohort makes the gap tolerable; explicit confirmation wanted.
3. **Clerk's $25/mo at 10K MAU acceptable?** Single-tier pricing philosophy says yes. Want to confirm vs. Better-Auth's $0 software + ops time.
4. **Are there any non-phone users I missed?** Codebase grep says no, but want confirmation that production Firebase Auth has no test accounts with email/password or OAuth providers that would need a different import path.
5. **Force re-auth at cutover, or attempt seamless session migration?** Force re-auth is much simpler and acceptable at <100 users. Seamless migration adds ~3 days of work for limited gain.
