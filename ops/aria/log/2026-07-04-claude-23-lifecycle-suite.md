---
type: session
issue: "#23"
created: 2026-07-04
---
# 23-lifecycle-suite — browser lifecycle + recovery coverage (5 specs, all green first run)

- **Goal:** Pin the avatar/browser path's lifecycle + recovery behavior so WebGL, visibility, remounts, load failure, and mobile can't regress silently (#23).

- **Work done:**
  1. **`apps/web/tests/lifecycle.spec.ts`** (new, 5 specs — every acceptance box):
     - **tab hide/show** — visibilitychange hidden→visible; render loop stops/starts; canvas PAINTS after (pixel proof, not just status).
     - **refresh after one turn** — session persists (no auth gate), avatar reloads, chat works again.
     - **repeated mount/unmount** — 3 view-switch cycles; stage paints after the churn (blank-stage guard); jsErrors fixture guards leak-crashes.
     - **load failure → fallback UI → retry recovers** — first GLB fetch aborted: `status=error` + warm copy ("couldn't appear right now") + Try again; retry loads + paints.
     - **mobile 390×844** — stage + loop stable, input visible, **no horizontal overflow** (scrollWidth check).
  2. **AvatarStage consistency fix:** the two HANDLED failure paths (mount/loadAvatar catch → fallback UI + retry) now `console.warn` (#24 precedent: a caught, user-recovered fault isn't a crash — and the jsErrors fixture enforces exactly that).

- **Files changed:** `apps/web/tests/lifecycle.spec.ts` (new), `apps/web/src/avatar/AvatarStage.tsx` (2 log-level lines).

- **Commands + evidence:** lifecycle suite **5/5 green on first run** · full `test:e2e:ci` **22/22** · web typecheck (src + tests, via the #25 gate) clean.

- **Decisions:** reused the POM's `canvasNonBlankCount` pixel proof for "recovered" (status alone can lie about a dead canvas); GLB-gated skip mirrors render.spec (CI downloads assets).

- **Next issue:** #40 billing (design/stub) — the last open buildable core item; then only owner-gated work remains.
