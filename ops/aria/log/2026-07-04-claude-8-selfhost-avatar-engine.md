---
type: session
issue: "#8"
created: 2026-07-04
---
# 8-selfhost-avatar-engine — three + TalkingHead off the CDN, strict CSP (F3 closed)

- **Goal:** Close the June volley's one MEDIUM (CDN-loaded avatar engine = RCE surface): self-host three + TalkingHead from our origin and tighten the CSP.

- **Work done:**
  1. **Vendored the full engine graph** into `apps/web/public/vendor/` (15 files, ~2.6MB, committed): `three@0.180.0` (immutable npm tgz — `three.module.js` + `three.core.js`) + the 6 addons TalkingHead imports + transitive deps (`BufferGeometryUtils`, `fflate`, `NURBSCurve`, `NURBSUtils`) + SHA-pinned TalkingHead `67a210b` (`talkinghead.mjs`, `dynamicbones.mjs`, `lipsync-en.mjs`).
  2. **Importmap → local** (`index.html`): `three` → `/vendor/three/three.module.js`, `three/addons/` → `/vendor/three/addons/`.
  3. **Driver → runtime same-origin URL** (`TalkingHeadDriver.ts`): `${window.location.origin}/vendor/talkinghead/talkinghead.mjs`. Two Vite gotchas solved: (a) root-relative dynamic imports get rewritten (`?import`) and Vite refuses to serve `/public` files as modules — a runtime-computed absolute URL + `@vite-ignore` yields a raw native import; (b) TalkingHead's sibling import `./dynamicbones.mjs` was initially missed — browser probe (playwright evaluate) surfaced the 404 behind Chrome's generic "Failed to fetch dynamically imported module".
  4. **Strict CSP** (`public/_headers`, F3 fix): dropped `https://cdn.jsdelivr.net` and `'unsafe-inline'` from script-src → `'self'` + the ONE sha256 hash of the inline importmap (recompute command documented in the file). Kept the audit's COOP/CORP/XFO extras + `connect-src https: wss:` for LiveAvatar.

- **Files changed:** `apps/web/public/vendor/**` (15 new), `apps/web/index.html`, `apps/web/src/avatar/TalkingHeadDriver.ts`, `apps/web/public/_headers`.

- **Commands + evidence:** probe confirmed importmap live in dev (bare `three` → REVISION 180) + every vendor URL 200/text-javascript; `pnpm -C apps/web test:e2e:ci` = **17/17 green including "the 3D avatar paints (non-blank canvas)"** — the avatar renders with zero CDN.

- **Decisions:** importmap+runtime-URL approach kept (vs bundling three via npm) — preserves the proven loading architecture and keeps the engine swap-able; lipsync stays a sibling runtime import (resolved relative to the engine URL).

- **Open items:** none for #8 — acceptance met (self-host ✅, CDN removed ✅, strict CSP ✅, Playwright green ✅). CSP is verified-by-construction (hash from the built dist); live-header verification happens at first deploy (#26).

- **Next issue:** #14 (security gate → CI) + #25 (web tests → CI).
