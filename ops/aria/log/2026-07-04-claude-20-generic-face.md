---
type: session
issue: "#20"
created: 2026-07-04
---
# 20-generic-face — Aria has a face in prod (committed generic preset; real avatars swap in later)

- **Goal:** Unblock "see her face" in prod NOW without waiting for hand-built Avaturn T2 GLBs (owner: "can you just make a generic face?").

- **Work done:**
  1. Committed a **generic default avatar** at `apps/web/public/preset/aria-default.glb` (4.7MB, from the smallest pre-approved TalkingHead sample — no real-person likeness, so the consent/deepfake design stays intact). Non-gitignored → ships in the Pages build (confirmed present in `dist/preset/`).
  2. `avatarLibrary.ts`: `loadAvatarLibrary()` returns the committed `DEFAULT_PRESET` in **prod** (and default in dev; dev also keeps the sample gallery). Documented the later swap: point at `GET /api/avatars` over the R2 library.
  3. `AriaTalkingView.tsx`: `SHOW_AVATAR = true` (was dev-only) — her face is on everywhere.
  4. Tests: render/lifecycle `hasGlb` now checks the committed preset (always present → the avatar specs always run, no gitignored-GLB download needed for them); lifecycle failure-mock widened to `**/*.glb`; @visual baseline regenerated for the new face (local-only, not a CI gate).

- **Files changed:** `apps/web/public/preset/aria-default.glb` (new), `apps/web/src/avatar/avatarLibrary.ts`, `apps/web/src/AriaTalkingView.tsx`, `apps/web/tests/{render,lifecycle}.spec.ts`, `apps/web/tests/render.spec.ts-snapshots/avatar-neutral-chromium-win32.png` (regenerated).

- **Commands + evidence:** web typecheck (src+tests) clean · `pnpm -C apps/web build` clean, preset in `dist/preset/` · full `test:e2e:ci` **22/22** (avatar paints from the committed preset).

- **Decisions:** committed one GLB (fast, CSP-clean same-origin serve) over an R2 pipeline for the MVP — the full R2 multi-avatar library + `/api/avatars` is the later #20 enhancement, drop-in when the owner provides real Aria GLBs. This is the generic-face MVP, NOT the final hand-built library.

- **Open items:** #20 residual = the real hand-built Avaturn T2 library (owner providing) → R2 + `/api/avatars` swap. Face now ships to prod meanwhile.

- **Next:** deploy prep — Twilio OTP path (worker wired for Plivo; owner has Twilio) + Turnstile + provisioning, per the owner deploy authorization.
