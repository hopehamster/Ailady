# Low-Token Execution Packet

Date: 2026-06-30

## Project

- Active repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- Active branch observed by Codex: `aria-web-build-e2e`
- Active product surface: root pnpm workspace
  - `apps/web`
  - `apps/worker`
  - `packages/aria-core`
  - `packages/shared-types`
- Legacy/mobile app path: `tools/girlai2`
  - still valuable history and fallback product code
  - not the default current execution surface unless a task explicitly targets Flutter/Firebase

## Current Goal

Build Aria as the intimate browser product with a reliable TypeScript/Cloudflare brain, secure worker surface, verified browser behavior, and a body layer that can express the psyche.

Near-term work is the psyche-readiness + security + tracking queue:

1. keep the standing web/security regression gates green
2. finish Wave 3 and Wave 4 dispatch work
3. reach a GO/NO-GO verdict for psyche-to-body readiness
4. preserve the Avaturn + TalkingHead body direction unless a new verified decision supersedes it
5. keep GitHub Issues/Projects, `ops/aria/`, and Obsidian aligned

## What Is Stable

- Clean repo is the only active implementation base.
- Old `Ailady` repo is reference-only.
- Aria web pivot is current:
  - TypeScript top-to-bottom
  - React/Vite web app
  - Cloudflare Worker backend
  - `aria-core` package owns brain/psyche logic
  - shared-types package owns portable contracts
- Phase 1 web brain stack is recorded as complete in global Claude memory:
  - conversation memory
  - structured memory
  - LLM extraction/write-gate
  - semantic recall
  - psyche safety budget
- Playwright is the primary browser verification path.
- Security posture after the 2026-06-22 volley:
  - no critical/high routine-attack findings
  - zero-tolerance tampering ban shipped
  - `pnpm security:gate` is the deterministic standing gate
  - `pnpm security:volley` is the manual/nightly deep run
- Avatar/body direction after June research:
  - lead path: Avaturn + TalkingHead with preset-only consent-safe avatars
  - Tavus is the photoreal fallback
  - HeyGen LiveAvatar LITE is no longer the lead because it cannot directly express per-turn psyche emotion

## Current Tracker Stack

- GitHub Issues/Projects: execution board and issue lifecycle
- `ops/aria/current/project-tracking.md`: repo-local tracking map and operating protocol
- `ops/aria/current/web-roadmap.md`: web-first launch roadmap
- `ops/aria/protocols/web-first-multi-agent-execution.md`: multi-agent ownership and collision rules
- `ops/aria/protocols/dispatch-sheets/`: task-level wave sheets
- Obsidian vault `C:\Users\Owner\Documents\Obsidian\aria-mind`: narrative memory, session logs, decisions
- `PROJECT_MEMORY_LEDGER.md`: compact cross-session memory index

## Current Next Step

Use the project tracker to drive the first web-first launch gates:

1. CORS adjudication against the later security-volley context
2. root CI/security gate installation
3. Cloudflare auth spike integration into the main worker plan
4. Wave 3:
   - W3-P live arcs
   - W3-L grader fleet
   - W3-M D1 schema
5. Wave 4:
   - W4-P Phase C fixes
   - W4-L T5 regression/ablation
6. Wave 5 GO/NO-GO verdict

## Do Not Touch Without Explicit Reason

- old `C:\Users\Owner\Documents\GitHub\Ailady` repo
- unrelated dirty-tree files
- generated dependency folders and Flutter ephemeral files
- production provider/auth architecture without checking current global memory and repo ops docs first

## Verification Commands

Root workspace:

```powershell
pnpm -r --if-present typecheck
pnpm -r --if-present test
pnpm -C apps/web test:e2e:ci
pnpm security:gate
```

Live/browser worker checks when needed:

```powershell
pnpm -C apps/worker dev
pnpm -C apps/web dev
ARIA_REAL_API=1 pnpm -C apps/web exec playwright test --grep "@real"
```

Flutter/mobile checks are required only for tasks touching `tools/girlai2`.

## Required Writeback

After material work:

- update `PROJECT_MEMORY_LEDGER.md`
- update `ops/aria/current/project-tracking.md` if tracking state changed
- update relevant `ops/aria/current/*`
- add one dated `ops/aria/log/YYYY-MM-DD-*.md`
- sync adapters with `scripts/sync-agent-adapters.ps1`
- use scoped checkpoint paths only

## Read More

1. `ops/aria/current/project-tracking.md`
2. `ops/aria/current/web-roadmap.md`
3. `ops/aria/protocols/web-first-multi-agent-execution.md`
4. `ops/aria/current/active-work.md`
5. `ops/aria/protocols/dispatch-sheets/INDEX.md`
6. `docs/security/VOLLEY_2026-06-22.md`
7. `C:\Users\Owner\Documents\Obsidian\aria-mind\work\sessions\index.md`
