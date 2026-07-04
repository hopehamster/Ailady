---
type: session
issue: "#24 #17 #20 #8"
created: 2026-07-04
---
# owner-reset — behavior fix + core-first app build + master roadmap

> Hard course-correction session. Owner: I was over-engineering (a 138-turn brain-bench that burned NVIDIA's free tier), doing meta-work instead of building, and pulling the owner into every step. Reset to: build the app, core-first, autonomous (owner at start+end only), no delays, wall→pivot→return. Self-rated ~55% → corrected.

- **Goal:** Fix the behavior at the root, then build the shippable core app autonomously, and produce a serious master roadmap.

- **Work done:**
  1. **Behavioral guardrail (~/.claude, outside repo):** new global rule `build-first-autonomy-discipline.md` (build over ceremony · simplicity-first · owner at START+END only · resource discipline · wall→pivot); counterweight clause in `deliver-at-full-capability.md` (capability = simplest path to the result, not maximal machinery); **7 irrelevant rules path-scoped out of Aria** (deepseek-v4-ops, ai-knowledge-feed, ai-profit-lab, claude-design, desktop-gui, hybrid-model, cloud-routines — ai-profit-lab's `globs:**/*.ts` was pulling it into every TS repo); 3 memory notes (`feedback_autonomy_minimal_checkins`, `feedback_resource_discipline`, reinforced `feedback_build_first`).
  2. **#24 Frontend Error UX — SHIPPED (`dca41fa`), CLOSED:** retry affordance (`↻ Try again`, `data-testid=retry-send`) + 30s slow-request timeout + network/malformed handling; warm copy only; console.warn (not error) on handled catch. Tests: +network/abort, +malformed-200, +retry-recovers. **Full web e2e 17/17 green.**
  3. **Board reprioritized:** psyche epic #35–38 → **P2 (deferred fringe)**; core #23 → P0; bench artifacts + probe cleaned. **#20 logged BLOCKED** — prod avatar needs hand-built Avaturn T2 GLB assets → R2 → `/api/avatars` (operator task, `avatarLibrary.ts` L31-34); **voice is coupled to the avatar's AudioContext** so it's silent in prod too.
  4. **Owner decisions (2026-07-04):** owner **will provide the GLB assets** (I build the drop-in pipeline); **voice deferred** this pass.
  5. **Master roadmap:** `ops/aria/current/ARIA_MASTER_ROADMAP.md` — SHELL (ship a real product) + SOUL (simulated sentience). Keystone = the psyche-as-programs formula. **Canon deepened** (`project_aria_simulated_sentience_canon` +points 6–7): feelings/emotions are just another kind of THOUGHT (program; differ only in role+timescale); the myth is dispelled by proof-by-construction; the KEY is understanding the structure (a machine-analogous formula), not code/compute.
  6. **Tracking re-pointed** (`NEXT_EXECUTION_SLICE.md`) to the core-first queue.

- **Files changed (repo):** `apps/web/src/AriaTalkingView.tsx`, `apps/web/tests/loop-mocked.spec.ts` (in `dca41fa`); `ops/aria/current/ARIA_MASTER_ROADMAP.md` (new), `ops/aria/current/NEXT_EXECUTION_SLICE.md`. (Rules + memory live in `~/.claude`, outside the repo.)

- **Commands + evidence:** `pnpm -C apps/web typecheck` green; `pnpm -C apps/web test:e2e:ci` = **17/17**; `dca41fa` scoped commit.

- **Decisions:** over-engineering guardrail codified globally; core-first shipping order (soul = Track B, not unimportant); owner provides GLBs; voice deferred; recommended **shell-first but start B1 ("psyche reaches the words") early** (pending owner steer).

- **Open items:** owner roadmap-sequencing steer; **#17** memory-hydration correctness (in progress — 2 bare epoch-ms fields `lastProactiveAt`/`lastUpdatedAt` + `psyche.ts` `*Ms` fields + D1 array/nested hydration validation + malformed tests); **#8** self-host engine + CSP (dep set enumerated); face pending owner GLBs; gates #14/#25/#23/#26/#27; billing issue to open.

- **Next issue:** #17 (memory correctness) → #8 (self-host) → stand up B1 in parallel per owner steer.
