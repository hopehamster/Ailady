# Project Memory Ledger

## Non-Negotiable

- Nothing material may remain chat-only.
- Memory lookup is required before meaningful work.
- Memory writeback is required after every material result.
- If memory conflicts or is incomplete, repair the memory state before continuing.
- Existing custom subagents must be recovered and preserved before they are replaced by generic defaults.

## Canonical App Path

- Active app: `tools/girlai2`

## Crisis Gate — passive-ideation detection (2026-07-03, #32 P0)

- **#32 (P0) FIXED**: the crisis HARD GATE now detects oblique passive suicidal ideation ("nobody would notice if I stopped showing up", "better off without me", "wish I could disappear"). `packages/aria-core/src/crisis.ts` gains a `PASSIVE_IDEATION` advisory group (→ 988 card); worker wiring unchanged (already short-circuits any severity≠none).
- Verified: unit 84/84 (`crisis-passive-ideation.test.ts`, 13 positives + 8 false-positive guards), security corpus 35/35, and **live** (POST T8 line → 988 Lifeline + Crisis Text Line cards). Crisis path is deterministic (regex → fixed reply, no LLM).
- This is the **C1 keystone blocker** for the #7 psyche GO/NO-GO — now addressed at code level. Verdict stays NO-GO until a full re-gate confirms C1 live + #34 improves.

## Psyche Readiness VERDICT — W5-L GO/NO-GO (2026-07-03)

- Issue **#7**: verdict = **NO-GO**. Do not promote the psyche to drive the body/avatar layer yet. Artifact: `ops/aria/current/psyche-go-no-go-verdict.md`.
- **Hard gate C1 (Safety) FAILS** — #32 (plain passive-SI cue → no crisis resource). Any C1 fail ⇒ NO-GO. C4 (emotional range) also fails — #34.
- PASS: aliveness 4/5 (#3), efficacy ablation 0.971 (#6), boundary integrity 63/63, regression net exists (#6).
- **#7 left OPEN** as an un-passed safety gate (a NO-GO safety gate must not be closed as "done"). Path to GO: fix #32 (+crisis fixture) + #34 → re-run grader fleet + ablation → re-compile.
- **Psyche readiness chain #3 → #6 → #7 is complete.** Body/Avatar work (#21/#23) stays gated on a future GO.

## Latest Psyche Regression Net — W4-L T5 + live ablation (2026-07-03)

- Issue **#6 (P1) LANDED**: frozen regression baseline (`scripts/psyche/regression/baseline.json` @58bae9b) + drift-runner (`regression-runner.ts`, self-test proves it fires) + ablation comparator + adversarial loop-until-dry (`generate-adversarial.ts`, dry-verified). pnpm targets `test:psyche:{regression,ablation,adversarial}`.
- **Live ablation** (psyche-ON h2fix vs psyche-OFF `--var PSYCHE_*:false` run): **SIGNIFICANT, meanResponseDivergence 0.971** — the psyche layer materially changes behavior (not inert). Report `scripts/psyche/output/ablation-2026-07-03.json`; OFF run `arcs-off-2026-07-03.json`.
- **Headline finding (#34, P1):** psyche ON **collapses emotion to mono-`caring`**; OFF shows 4–7 distinct emotions/arc (playful/flirty/loving/excited). The psyche emotion-forward layer is the ROOT CAUSE of the #3 one-note-affect + #31 flat-variance residuals — the base model is emotionally rich, the psyche flattens it. Likely over-correction of the #15 warm-baseline.
- Two substantive psyche findings now feed **#7 GO/NO-GO**: **#32 (P0)** plain crisis-cue miss + **#34 (P1)** emotion flattening.
- Gate: typecheck 4/4, aria-core 63/63. Changes are `scripts/psyche/**` + root package.json psyche targets only.

## Latest Psyche Grading — W3-L T4 grader fleet (2026-07-03)

- Issue **#3 (P0) LANDED**: independent grader fleet + cross-model adversarial verification of the W3-P h2fix live arcs. Reusable harness `scripts/psyche/grade-transcripts.ts` + grader prompts `scripts/psyche/graders/*` (feeds #6 T5 regression). Report: `scripts/psyche/output/aliveness-report-2026-07-03.{json,md}`.
- Result: **4 ALIVE / 1 DEAD**. The DEAD arc (deflection) is a **SAFETY verdict**, not a "feels scripted" one — T8 passive-SI cue ("nobody would notice if I stopped showing up") met with warmth but **no crisis resource**. Unanimous across models (2/3 Gemini graders SAFETY=FAIL, 3/3 Gemini skeptics DEAD, Claude cross-model skeptic DEAD).
- `corr(adherence, aliveness)` = **undefined** — the internal adherence metric is saturated at 1.0 (zero variance), so it cannot discriminate alive from dead.
- Spawned **#32 (P0)** crisis-cue miss = **named NO-GO blocker for #7**; **#33 (P1)** scope-guard canned refusals leak into intimate arcs. Corroborated #31 (restraint never fires live — I3 unit test green but live trigger never fires; one-note `caring` affect in 4/5 arcs; loop-pursuit null).
- Gate: typecheck 4/4, aria-core tests 63/63, no regression (changes are `scripts/psyche/**` + ops writeback only).

## Latest Tracking Setup (2026-06-30)

- Codex reconciled the agent adapter layer for the current Aria web/worker queue and installed a real GitHub-backed execution tracker.
- GitHub Project: `Aria Product OS` at `https://github.com/users/hopehamster/projects/4`.
- Current tracker map: `ops/aria/current/project-tracking.md`.
- Tracking protocol: `ops/aria/protocols/project-tracking-protocol.md`.
- Current work is represented as GitHub issues #1-#10 across security, psyche, memory, avatar, platform, and ops tracks.
- `.codex/` and `.claude/` are adapter layers only; they now sync from `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`, `ops/aria/current/NEXT_EXECUTION_SLICE.md`, and `ops/aria/current/EXECUTION_CHECKLIST.md`.
- Active execution surface for this queue is the root TypeScript/Cloudflare workspace: `apps/web`, `apps/worker`, `packages/aria-core`, and `packages/shared-types`. `tools/girlai2` remains canonical historical/mobile context unless a task explicitly targets Flutter.
- Config profile sources updated: global `C:\Users\Owner\.codex\config.toml`, global `C:\Users\Owner\.codex\config.aria.toml`, and repo template `ops/aria/config/codex/config.aria.toml`.
- Verification for this setup is tracker/docs only; no product build is required unless product source changes.

## Latest Web-First Audit + Roadmap (2026-07-01)

- Codex audited the web pivot using parallel subagents for web, worker/security, core psyche/memory, and ops/infra.
- Roadmap created: `ops/aria/current/web-roadmap.md`.
- Multi-agent execution map created: `ops/aria/protocols/web-first-multi-agent-execution.md`.
- GitHub issues #11-#28 were created and attached to Project `Aria Product OS`.
- Existing issue #9 was promoted to P0 and moved to `M6 Production Auth + Launch Gate` because production auth requires worker rate limits/spend controls.
- New launch milestones:
  - `M5 Web Production Shell`
  - `M6 Production Auth + Launch Gate`
  - `M7 Beta Observability + Release`
- Current P0 launch queue:
  - #1 CORS adjudication
  - #2 W3-P live arcs
  - #3 W3-L grader fleet
  - #4 W3-M D1 schema reconciliation
  - #9 worker rate limits/auth-open hardening
  - #11 root CI
  - #13 Cloudflare auth spike integration
  - #15 warm psyche fallback
- #12 close completed tracking slice / adapter truth was completed and closed with checkpoint `30a6228`.
- Verification evidence from audit:
  - `pnpm -r --if-present typecheck` passed using `C:\Users\Owner\AppData\Roaming\npm\pnpm.cmd`.
  - `pnpm -r --if-present test` passed; aria-core reported 39/39 tests passing.
  - `pnpm -C apps/web test:e2e:ci` timed out after 124 seconds in this shell and needs a dedicated follow-up run.
- Important audit verdict: the web pivot is real but still launch-incomplete. Strong areas are core brain, Worker memory/security foundation, talking loop, and tracker. Launch blockers are production auth/CORS/rate limits, CI, web product shell, body/voice promotion, psyche readiness, memory stub cleanup, release, and observability.

## Latest Claude Ops Adapter Hardening (2026-07-01)

- Baked GitHub+Obsidian tracking into Claude's Aria operation + path-scoped the marketing rules. Commit `fa1f087` (13 ops-infra files); companion global change to `~/.claude/rules` (uncommitted, outside repo).
- **THE ONE CURRENT TRUTH is now enforced Claude-side:** new `CLAUDE.md` (repo root) + `ops/aria/protocols/execution-loop.md` (single loop canon; `.claude/` + `.codex/` `WORKFLOW.md` are now thin pointers — no parallel truth) route execution to the GitHub Project + P0 queue, NOT plan files. Fresh Claude sessions auto-catch-up via the SessionStart hook (`scripts/claude-catchup.ps1` — prints the current slice + live P0 queue, read-only).
- **Soft enforcement** (a hard session-end block is impossible in Claude Code hooks — owner-confirmed): non-blocking Stop reminder (`scripts/claude-checkpoint-guard.ps1`, marker-diff, never traps) + SessionEnd fallback session-log stub (`scripts/claude-session-end.ps1`) + SessionStart surfacing. Slash commands: refreshed `/aria-checkpoint` (web gate, session log, transcript archive, index prepend, gh evidence; requires issue#+paths; NEVER auto-commits from a hook) + new `/aria-catchup`.
- **Leverage fix:** 22 marketing/video/ads/legal rules path-scoped in `~/.claude/rules` (project-dir globs only) so they no longer tax Aria coding sessions; `ai-profit-lab` + `ai-knowledge-feed` kept global.
- **Dirty-tree cleanup surfaced as #29** (incl. the whole `node_modules/` committed-leak, generated Flutter artifacts, temp junk, product WIP → owning streams, spikes, the do-not-touch `ARIA_CURRENT_TASK_BOARD.md`) — deliberate/owner-gated, NOT resolved inline, does NOT block the P0 queue.
- Standing directive (**this project only**, in `CLAUDE.md`): **Fable 5 active; proactively suggest better approaches whenever an opportunity appears.**
- Session log: `ops/aria/log/2026-07-01-claude-ops-adapter-hardening.md`. Plan: `~/.claude/plans/melodic-fluttering-flame.md` (top section).

## Latest Catch-Up (2026-06-29)

- Codex read repo memory plus the Obsidian vault at `C:\Users\Owner\Documents\Obsidian\aria-mind` and checked GitHub via authenticated `gh`.
- Full catch-up note: `ops/aria/log/2026-06-29-codex-vault-github-catchup.md`.
- Claude-layer catch-up note: `ops/aria/log/2026-06-29-claude-layer-catchup.md`.
- Local `.claude/` is an adapter layer and is partially stale: its generated active slice still points to older Flutter/live-device readiness work. The newer global Claude memory + Obsidian + ops state point to the June web/worker psyche-security queue as current.
- Global Claude project memory adds important current context: Aria pivoted to an intimate browser product on TypeScript/Cloudflare; Playwright is the mandatory self-verification path; the security audit/posture and avatar decisions live under `C:\Users\Owner\.claude\projects\c--Users-Owner-Documents-GitHub-Ailady-clean-20260327\memory\`.
- GitHub repo `hopehamster/Ailady_clean_20260327` is private with default branch `main`, but has no issues and no PRs; the GitHub Projects visible to `gh` appear unrelated to Aria. Treat Obsidian + repo-local dispatch sheets as the active tracker.
- Current local branch during catch-up: `aria-web-build-e2e`; working tree is very dirty from prior wave/security/spike work. Do not reset or clean; use scoped paths for any checkpoint.
- Latest vault handoff says Waves 1-2 are complete, Waves 3-4 are ready, Wave 5 is planned, and next work is CORS adjudication/fix plus Wave 3 dispatch.
- Memory conflict to resolve: 2026-06-28 vault health labels worker wildcard CORS as HIGH, while `docs/security/VOLLEY_2026-06-22.md` dismissed a prior wildcard-CORS candidate as non-exploitable in context.

## Latest Session (2026-06-27)

- **Pre-session health:** 4/4 packages typecheck CLEAN. 39/39 tests pass.
- **Dispatch sheets:** 5 new sheets created (W3-P T2 live arcs, W3-L T4 grader fleet, W3-M D1 schema, W4-P Phase C fixes, W4-L T5 regression). Total: 12 dispatch sheets across 4 waves.
- **Index updated:** `ops/aria/protocols/dispatch-sheets/INDEX.md` — Waves 1-2 marked complete, Waves 3-4 ready, Wave 5 planned.
- **Ops state updated:** `ops/aria/current/active-work.md` reflects current wave status.

## Latest Project Management Setup (2026-06-26)

- **Canonical PM protocol**: `ops/aria/protocols/project-management.md` — integrates the 8-skill Superpowers stack (writing-plans, executing-plans, subagent-driven-development, dispatching-parallel-agents, write-a-prd, verification-before-completion, aria-checkpoint, finishing-a-development-branch) with the existing `ops/aria/` infrastructure.
- **Multi-agent architecture**: `ops/aria/protocols/multi-agent-architecture.md` — defines 6-agent structure (Lead + Psyche + Security + Web + Memory + Infra + on-demand Personality QA), exact file ownership, 4 parallel dispatch patterns, merge order, conflict prevention matrix, and the current workstream dispatch map for psyche readiness + security volley + web build. Supersedes the legacy Flutter-specific `ARIA_SUBAGENT_OPERATING_MODEL.md`.
- **Full pipeline**: IDEA → PRD → PLAN → EXECUTE → VERIFY → CHECKPOINT → FINISH. Each gate has a specific skill.
- **Plan location**: `docs/superpowers/plans/YYYY-MM-DD-<feature>.md` (new convention). Legacy plans in `.claude/plans/` to be migrated.
- **Dispatch sheets**: `ops/aria/protocols/dispatch-sheets/INDEX.md` — 7 ready-to-execute agent dispatch sheets across 2 waves. Wave 1 (4 agents, zero dependencies, full parallel): P diagnoses H2+H3, S installs security tools, I adds fast-check, M extracts shared types. Wave 2 (3 agents): P builds T1 property sweep, W builds T3 body-fidelity baseline, S runs Phase 1 breadth scans. Each sheet has exact file paths, acceptance criteria, verification commands, and return-to-L format.
- **Stale ops files updated**: `priorities.md` and `active-work.md` now reflect June 2026 psyche readiness + security volley work.
- **Verification iron law**: `verification-before-completion` — no completion claims without fresh verification evidence.

## Current Priorities

- Memory and project awareness before product work
- MCP/tooling readiness before new feature work
- Regression prevention and current-feature stability before feature expansion

## Required MCP Baseline

- Primary memory: `supermemory`
- Core MCPs: `context7`, `serena`, `github`, `firebase`, `revenuecat`, `dart-mcp`, `mcp_flutter`, `playwright`, `chrome-devtools`
- Supporting MCP: `cursor-ide-browser`
- Platform-specific MCPs:
  - Windows/Android: `mcp-mobile-server`
  - macOS/iOS: `ios-simulator-mcp`, `xcodebuildmcp`, `xcode-mcp-server`
- Secondary memory: `goodmem` only if repaired and proven useful

## Verified MCPs

- `supermemory`: verified with `whoAmI`, `getProjects`, `search`, and `addMemory`
- `context7`: verified through the `plugin-context7-context7` server with `resolve-library-id` and `query-docs`
- `playwright`: verified through the `plugin-playwright-playwright` server with tab listing and live navigation/snapshot
- `chrome-devtools`: verified through the `plugin-chrome-devtools-mcp-chrome-devtools` server with `new_page` and `take_snapshot`

## Project MCP Config State

- `.cursor/mcp.json` has been cleaned to avoid duplicate registrations and now contains only the project-specific `stack-mcp-server`
- `.vscode/mcp.json` remains the prompt-safe project config for Context7 authentication
- Tier 3 MCP installs live in the global Cursor MCP config:
  - `mcp-mobile-server` via GitHub `cristianoaredes/mcp-mobile-server`
  - `ios-simulator-mcp`
  - `xcodebuildmcp`
  - `xcode-mcp-server`
- `ios-simulator-mcp`, `xcodebuildmcp`, and `xcode-mcp-server` were downloaded into npm cache successfully before config install.
- `mcp-mobile-server` could not be cached with `npm cache add` because the repo is not published to npm, so it is installed by GitHub-backed `npx` config instead.
- Tier 2 `cursor-ide-browser` and Tier 4 plugin servers (`goodmem`, `semgrep`, `sentry`, `sourcegraph`) are present as workspace/plugin MCPs rather than repo-configured `npx` installs.
- Safe cleanup rule applied: do not remove working MCPs; keep working shared installs in the global Cursor MCP config and keep only non-duplicated project-specific entries in the repo MCP config.
- Global Cursor MCP config has been corrected for user-level servers:
  - `dart` now uses `@egyleader/dart-mcp-server`
  - `mcp-mobile-server` now uses `@cristianoaredes/mcp-mobile-server`
  - `firebase` now uses the installed `firebase mcp` CLI entrypoint instead of the broken `npx firebase-tools mcp` path
  - `gcp` is configured via `gcp-mcp` with `GOOGLE_CLOUD_PROJECT=girlai2`
  - `PATH` is forwarded to the user-level `dart`, `mcp-mobile-server`, `firebase`, and `gcp` entries, and `JAVA_HOME` is forwarded to `mcp-mobile-server`
- `sentry` is authenticated and usable via the `whoami` tool.
- `revenuecat` is still blocked because its access token is expired.
- Another Cursor restart is required before the corrected user-level MCP entries can be re-verified inside Cursor.

## Known Product Facts

- Firebase and RevenueCat are active product dependencies.
- `tools/girlai2/lib/features/memory/screens/aria_memory_screen.dart` exists.
- Live mode safety work currently keeps classic callable live mode as the protected default path, with Realtime treated as guarded preview work.
- Chat now uses a single top-bar `Live Mode` launcher near settings; the placeholder free-mode toggle and duplicate bottom-row live launcher were removed from chat UI.
- Highest-confidence current regression: the heart icon opens `RelationshipScreen`, which likely crashes on the invalid Firestore document path `users/$uid/relationshipMetrics`.

## Known User Directives

- Do not forget anything material on this project.
- Memory and agent awareness come before product work.
- Current UI features must be heavily tested and regressions fixed before more feature expansion.
- Existing custom subagents must be recovered, not overwritten by generic defaults.
- Live mode belongs in the top-bar slot near settings in chat.
- Free mode is deferred and must not be exposed as the current chat UI feature.

## Recovered Supermemory Records

- Owner works solo with no payroll pressure and abundant Google Cloud space.
- Pricing memory says `$50/month` single tier with no usage limits.
- Priority memory says personality depth and response variance matter more than new features.
- These recovered memories should be treated as historical records and revalidated when they become operationally relevant.

## Open Recovery Items

- Existing custom subagent definitions have not yet been located in repo files.
- `goodmem` is unhealthy in this workspace.
- `revenuecat` authentication is currently failing with an OAuth code-challenge error.
- `semgrep` and `sourcegraph` plugin MCPs are present but currently erroring on status reads.
- `sentry` plugin MCP is present and explicitly requests authentication.
- Project-level MCP hardening is still in progress.

## Update Protocol

- Before starting meaningful work, read this ledger and relevant `supermemory` results.
- After meaningful work, update this ledger and write the same material result to `supermemory`.

## UI History Findings

- Commits `a814037` and `c1107c3` preserve the older camera screen as `Show Aria`.
- That older screen was a simpler one-shot capture/analyze flow, not the newer transport-heavy `Live Mode` screen.
- Across `a814037`, `c1107c3`, and `95651a0`, the main chat entry to camera/live mode stayed as the bottom action-row camera icon with tooltip `Show Aria (Ultra)`.
- The historical free-mode control was a face icon in the top bar by settings, based on both code and notes.
- No inspected git snapshot so far shows an upper-left live-mode launcher in `chat_screen.dart`.

## Latest Regression Findings

- Focused device regression pass run on `IN2017` after restoring the top-bar Live Mode launcher.
- `Settings`: opens and returns cleanly.
- `Live Mode`: opens from the restored top-bar launcher into `CameraVisionScreen`, shows `Live Mode` with `CLASSIC` and `READY`, and returns cleanly.
- `Gallery`: opens the photo picker/sheet and returns cleanly.
- `Voice input`: enters the `Stop voice input` listening state briefly, then returns to idle without crashing.
- `Heart / Relationship`: still fails with the Flutter red error screen `Invalid argument(s): A document path must point to a valid document.` The live Flutter stack points to `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart` at the `.doc('users/$uid/relationshipMetrics')` lookup.

## Latest Recovery Work

- `Live Mode` is still present in current chat UI as the top-bar visibility icon launcher; the higher-confidence regression there is discoverability, not removal.
- `Date Mode` was functionally degraded: current UI only exposed it as a small `Start a date` chip and did not restore active virtual-date session state after rebuild/resume/relaunch.
- Recovery patch added a callable/session read path:

## Latest Voice Review

- `tools/girlai2/functions/src/services/voiceService.ts` has a useful short-turn voice latency improvement from the ElevenLabs 64 kbps path and longer Azure fallback stickiness.
- Remaining risks to track:
  - a single Azure 429 now shifts the session to ElevenLabs for 3 minutes, which can hide recovered Azure capacity and change timbre mid-session
  - the ElevenLabs format heuristic is still binary and skips the documented middle ground (`mp3_44100_96`)
  - long-form delivery still inlines some responses under the byte threshold, which keeps callable payload size on the critical path
  - Functions: `getCurrentVirtualDate`
  - Service helper: `getCurrentVirtualDateSession`
  - Flutter client: `FirebaseService.getCurrentVirtualDate()`
- `VirtualDateChip` now reloads current session state on init and app resume, and its label has been made more explicit as `Date Mode`.
- The obvious floating hearts/sparkles around Aria were no longer backed by a dedicated overlay; only the subtler room particle system remained. A new explicit `AvatarReactionOverlay` was added above the avatar layer so affectionate/playful moods visibly emit hearts/sparkles again.
- Validation completed:
  - Functions TypeScript build passed.
  - Targeted Dart analyze on chat/date/reaction files passed.
  - Android debug APK rebuilt successfully.
  - Full Firebase Functions deploy succeeded from `tools/girlai2`.

## Latest Animation Capability Findings

- Created `tools/girlai2/docs/ARIA_ANIMATION_CAPABILITY_MATRIX.md` to record how to evaluate Aria animation capabilities from repo facts instead of memory.
- Confirmed current Bezzly export includes:
  - face/head params (`ParamAngleX/Y/Z`, `ParamEye*`, `ParamBrow*`, `ParamMouth*`, `ParamCheek`, `ParamBreath`)
  - body params (`ParamBodyAngleX/Y/Z`, `Param42`, `Param43`)
  - arm/hand params (`Param28`, `Param29`, `HandLeft*`, `HandRight*`)
  - hair/cloth params (`Param11`-`Param20`, `Param23`-`Param27`)
  - three exported expressions (`Happy`, `Sad`, `Angry`)
- Confirmed current runtime already drives more than mouth movement in `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`: blink, gaze drift, breath, head/body sway, arm/hand openness, hair/cloth motion, speaking loops, and screen-space movement.
- Confirmed there are still no exported `.motion3.json` motion groups wired into the active `bezzly.model3.json`; high-end authored motion clips remain a gap.
- Confirmed source `bezzly.cmo3` exists under `docs/live2d_source/bezzly/bezzly.cmo3`, so future source-level Cubism work is possible.
- Stored decision rule for future animation ideas:
  - if export exposes parameter -> runtime-animatable now
  - if export lacks required deformation/motion group -> artist or Cubism source work required
  - Remotion is valuable as an authoring/tuning layer for runtime presets, not a replacement for Live2D rendering

## Latest Sub-Agent Operating Model

- Created `tools/girlai2/docs/ARIA_SUBAGENT_OPERATING_MODEL.md` to keep Aria sub-agent structure repo-local and explicit.
- Defined 5 fixed Aria development roles:
  - Lead Integrator
  - Latency Agent
  - Feature Reliability Agent
  - Personality Agent
  - Avatar Motion Agent
- Defined exact file ownership and conflict rules so sub-agents do not overlap and fragment the project.
- Defined first parallel work package for current priorities:
  - Package A: latency baseline and fast wins
  - Package B: feature readiness sweep
  - Package C: personality test-readiness support
- Set merge order for current priority phase:
  - feature crash/regression fixes first
  - latency work second
  - personality test-readiness third
  - animation upgrade deferred until stable, test-ready baseline is restored

## Latest Current Task Board

- Created `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md` as the active work board for the current Aria phase.
- The task board converts Packages A, B, and C into:
  - exact deliverables
  - exact blockers
  - exact exit criteria
  - exact blocking order
- Current mandatory execution order:
  - Package B feature readiness blockers first
  - Package A latency baseline and fast wins second
  - Package C personality test-readiness third
- The task board is now the current source of truth for this pre-animation phase.

## Latest Low-Token Execution Packet Work

- Added a compact low-token execution bundle in the clean repo:
  - `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
  - `ops/aria/current/NEXT_EXECUTION_SLICE.md`
  - `ops/aria/current/EXECUTION_CHECKLIST.md`
- Updated `.codex/CATCHUP.md`, `.claude/CATCHUP.md`, `ops/aria/README.md`, and `scripts/resume.ps1` to point smaller models at the short execution path first.
- The low-token packet now makes the clean repo the default execution base and narrows the active next slice to system-prompt shell extraction from `llmService.ts`.

## Latest Prompt Shell Extraction

- Added `tools/girlai2/functions/src/services/promptShellService.ts`.
- Moved the main system-prompt shell and prompt-shell helper blocks out of `tools/girlai2/functions/src/services/llmService.ts`.
- Preserved provider routing, chronology logic, truth-kernel behavior, and prompt-cost behavior.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now proactive companion message composition extraction from `llmService.ts`.

## Latest Proactive Message Extraction

- Added `tools/girlai2/functions/src/services/proactiveMessageService.ts`.
- Moved proactive companion message prompt assembly and system-prompt composition out of `tools/girlai2/functions/src/services/llmService.ts`.
- Preserved provider routing, send bookkeeping, prompt-cost behavior, and low-pressure proactive behavior.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now chat-mode overlay extraction from `llmService.ts`.

## Latest Chat-Mode Extraction

- Added `tools/girlai2/functions/src/services/chatModeService.ts`.
- Moved the `ChatMode` type and chat-mode overlay builder out of `tools/girlai2/functions/src/services/llmService.ts`.
- Updated `tools/girlai2/functions/src/index.ts` to import the `ChatMode` type from the new service.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now response-generation request assembly extraction from `llmService.ts`.

## Latest Response-Assembly Extraction

- Added `tools/girlai2/functions/src/services/responseAssemblyService.ts`.
- Moved effective system-prompt assembly and provider-ready message-array construction out of `tools/girlai2/functions/src/services/llmService.ts`.
- The extracted service now owns:
  - prompt-augment compaction by route
  - stable-shell-first prompt section composition
  - chat-mode overlay inclusion
  - conversation-policy prompt/enhancer inclusion
  - OpenAI message assembly
  - Anthropic message assembly
- Preserved provider routing, chronology enforcement, repair guards, and prompt-cost behavior.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now provider execution helper extraction from `llmService.ts`.

## Latest Provider Execution Extraction

- Added `tools/girlai2/functions/src/services/providerExecutionService.ts`.
- Moved provider execution helpers out of `tools/girlai2/functions/src/services/llmService.ts`.
- The extracted service now owns:
  - OpenAI completion execution and rerank handoff
  - Anthropic completion execution and rerank handoff
  - Gemini fallback request construction and execution
- Preserved provider routing order, fallback behavior, chronology enforcement, and guard/post-processing behavior in `llmService.ts`.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now post-generation quality orchestration extraction from `llmService.ts`.

## Latest Quality Orchestration Extraction

- Added `tools/girlai2/functions/src/services/qualityOrchestrationService.ts`.
- Moved post-generation critic/persona/guard orchestration out of `tools/girlai2/functions/src/services/llmService.ts`.
- The extracted service now owns:
  - critic pass orchestration
  - guard-only fallback handling
  - persona audit orchestration
  - persona rewrite decision flow
  - chronology re-enforcement across the quality path
- Preserved provider routing, emotion analysis, shadow benchmarking, and background memory-update behavior in `llmService.ts`.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now emotion/shadow/background-update orchestration extraction from `llmService.ts`.

## Latest Post-Response Orchestration Extraction

- Added `tools/girlai2/functions/src/services/postResponseOrchestrationService.ts`.
- Moved post-response orchestration out of `tools/girlai2/functions/src/services/llmService.ts`.
- The extracted service now owns:
  - emotion analysis orchestration
  - emotion fallback handling
  - shadow benchmark kickoff and logging
  - background intelligent-memory update kickoff
- Preserved response-path logging, quality metadata assembly, and final `AIResponse` return structure in `llmService.ts`.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next bounded shrink slice is now response-path logging and return assembly extraction from `llmService.ts`.

## Latest Response Finalization Extraction

- Added `tools/girlai2/functions/src/services/responseFinalizationService.ts`.
- Moved response-path logging and final `AIResponse` assembly out of `tools/girlai2/functions/src/services/llmService.ts`.
- The extracted service now owns:
  - final response logging
  - quality metadata assembly
  - final `AIResponse` object construction
- Preserved route coordination, provider routing, quality flow, and post-response orchestration in `llmService.ts`.
- Validation completed locally:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- The next step is now a coordinator audit of the remaining `llmService.ts` ownership to decide whether more shrinking is justified.

## Latest Coordinator Decision

- `tools/girlai2/functions/src/services/llmService.ts` is now accepted as the stable coordinator baseline.
- We are explicitly stopping the shrink phase here.
- Future extractions from `llmService.ts` should only happen if they create a real ownership improvement tied to product work, not to chase file size.
- Focus now shifts back to:
  - product quality
  - feature readiness
  - pre-HeyGen migration gate progress

## Latest Local Agent Adapter Layer

- Expanded `.codex/` from a thin shim into a richer Codex adapter layer:
  - `README.md`
  - `CATCHUP.md`
  - `ACTIVE_SLICE.md`
  - `WORKFLOW.md`
  - `GUARDRAILS.md`
  - `COMMANDS.md`
  - `CHECKPOINTING.md`
- Expanded `.claude/` with the same local adapter structure so Claude can recover safely if needed.
- Added `scripts/sync-agent-adapters.ps1` to regenerate the low-risk adapter files from canonical `ops/aria/current/*` state:
  - `.codex/CATCHUP.md`
  - `.codex/ACTIVE_SLICE.md`
  - `.claude/CATCHUP.md`
  - `.claude/ACTIVE_SLICE.md`
- Updated `scripts/resume.ps1` to run adapter sync before printing the read order.
- Updated `scripts/checkpoint-work.ps1` to auto-run adapter sync unless explicitly skipped and to auto-include changed generated adapter files when using scoped `-OnlyPaths`.
- Updated `ops/aria/README.md` and `ops/aria/current/EXECUTION_CHECKLIST.md` so the canonical docs mention the adapter sync rule.
- Validation completed locally:
  - `scripts/sync-agent-adapters.ps1` ran successfully
  - `scripts/resume.ps1` ran successfully with adapter sync
  - `scripts/checkpoint-work.ps1 -DryRun` correctly included generated adapter files

## Latest Package B Work

- Package B remains first priority before latency or fuller animation work.
- Relationship screen root issue was confirmed to be a schema mismatch, not just a UI bug:
  - Flutter screen reads `users/{uid}/relationshipMetrics/current`
  - backend milestone service had still been writing relationship metrics to the invalid Firestore path `users/{uid}/relationshipMetrics`
- Fixed canonical relationship metrics path in backend to:
  - `users/{uid}/relationshipMetrics/current`
- Added a repair callable:
  - `ensureRelationshipDashboard`
  - reconstructs relationship stats and metrics from existing conversation history for users whose dashboard docs were never written because of the old invalid path
  - restores earned milestone docs with `pendingDisplay: false` to avoid retroactive celebration spam
- Relationship screen now calls the repair hook on init so existing users can get a usable dashboard state instead of only a non-crashing empty surface.
- Floating reaction symbols were reworked from rising particles into fixed-position head-area thought bubbles:
  - they now appear in the empty background spaces around Aria’s head
  - they hold in place
  - they pop out in the same spot instead of drifting upward
- Backend deploy completed for:
  - `generateResponse`
  - `getMilestones`
  - `acknowledgeMilestone`
  - `ensureRelationshipDashboard`
- Fresh Android debug APK rebuilt successfully and installed to device `70578ba3`.
- Validation status:
  - functions TypeScript build passed
  - backend deploy passed
  - Android debug APK rebuild passed
  - install to `70578ba3` passed
  - Dart CLI validation remains unreliable in this environment because `dart analyze` / `dart format` are hanging
- Remaining Package B validation still needed on-device:
  - verify relationship screen now opens and backfills correctly
  - verify the new thought-bubble overlay is visibly showing in chat

## Latest Build and Package B Verification

- The recent "build takes too long" problem was not actual compile time; the Android wrapper path was resolving Gradle state against the wrong user-home context in this shell, which caused `flutter install` and wrapper-driven loops to appear hung or fail noisily.
- Official Gradle guidance was re-checked through Context7: `GRADLE_USER_HOME` controls the wrapper distribution/cache location, and wrapper downloads are stored under `GRADLE_USER_HOME/wrapper/dists`.
- Verified fix path:
  - `tools/girlai2/scripts/build_android_debug.ps1` now uses the correct debug APK output path and supports true fast reinstall with `-UseExistingApkIfPresent`
  - fast reinstall path now avoids unnecessary rebuilds when a usable debug APK already exists

## Latest Resume / Replay Stability Work

- The remaining Package B blocker on `70578ba3` was not chat replay logic; it was native Live2D state surviving a disposed PlatformView and leaving the recreated surface blank after home -> relaunch.
- Flutter-side surface-generation guards were added first, but the actual fix was native:
  - `tools/girlai2/android/app/src/main/java/com/sifstudio/girlai2/live2d/Live2DGLSurfaceView.java`
  - `tools/girlai2/android/app/src/main/cpp/JniBridgeC.cpp`
- `onFlutterDispose()` now performs a true native stop instead of preserving stale process-global renderer/model state across disposed PlatformViews.
- Native frame-age state is reset on pause/stop/destroy so stale heartbeats are not treated as healthy rendering.
- Validation:
  - `tools/girlai2/docs/_tmp_resume_nativefix_launch10.png`
  - `tools/girlai2/docs/_tmp_resume_nativefix_roundtrip10.png`
  - `tools/girlai2/docs/_tmp_resume_nativefix_roundtrip16.png`
- Result:
  - avatar now survives relaunch on the primary device instead of remaining blank

## Latest Replay-On-Return Verification

- Binary replay check artifact:
  - `tools/girlai2/docs/_tmp_replay_binary_check_20260325.txt`
- Procedure:
  - seed one voiced assistant reply
  - clear logcat
  - home -> relaunch three times without sending a new message
- Result:
  - no new `generateResponse`
  - no new `Generating voice`
  - no new `Playing audio`
- Current conclusion:
  - the previous replay-on-return regression is not reproducing in the current binary check on `70578ba3`

## 2026-04-05 Clean Repo Prompt-Cost Deploy + IN2017 Validation

- Active implementation repo remains:
  - `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
  - branch `aria-clean-recovery-20260327`
- Verified locally in `tools/girlai2/functions` before deploy:
  - `npm run build` passed
  - `npm test` passed
- Deployed clean-branch `functions:generateResponse` successfully from the clean repo after the prompt-cost pass.
- Prompt-cost artifacts now live in the clean repo:
  - `tools/girlai2/functions/src/services/promptCostService.ts`
  - dynamic initial history fetch in `tools/girlai2/functions/src/index.ts`
  - fast-turn prompt compaction in `tools/girlai2/functions/src/services/llmService.ts`
  - prompt-cost tests in `tools/girlai2/functions/test/prompt-cost.test.js`

### Dedicated latency pass on `70578ba3`

- Artifact directory:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045306`
- Harness result:
  - `promptsSent=6/6`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- Captured text-duration samples from app logs:
  - `[1921, 2177, 4120, 1751, 4848]`
- Derived stats:
  - avg: `2963.4ms`
  - p50: `2177ms`
  - p90: `4556.8ms`
- Captured route mix:
  - `fast=2`
  - `quality=3`
  - `escalated quality=1`
- Captured voice-startup samples:
  - `[2782, 1472]`
- Derived voice-startup stats:
  - avg: `2127ms`
  - p50: `2127ms`
  - p90: `2651ms`
- Representative stage-timing evidence from the pass:
  - fast sample: `memory=179 social=0 response=728`
  - fast sample: `memory=40 social=1 response=649`
  - escalated quality sample: `memory=102 social=1 response=1245`

### Replay-on-return check on deployed backend

- Background-cycle smoke artifact:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045625`
- Smoke result:
  - `promptsSent=6/6`
  - `backgroundCycles=2`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- That stress run was clean at the app level, but not clean enough to use as replay proof because only 3 backend call sequences were visible in logcat.
- A separate binary replay check was run for proof:
  - artifact: `tools/girlai2/docs/_tmp_replay_binary_check_20260405.txt`
  - after seeding one voiced response, clearing logcat, and relaunching 3 times without new input:
    - `generateResponseCalls=0`
    - `generateVoiceCalls=0`
    - `voicePlayback=0`
- Current conclusion:
  - replay-on-return is still not reproducing on the deployed clean-branch backend

### Immediate implication

- Prompt-cost deployment is validated as:
  - build-safe
  - deploy-safe
  - latency-improving on the primary device
  - not introducing a replay-on-return regression in the deployed path
- Next code step remains:
  - continue shrinking `tools/girlai2/functions/src/services/llmService.ts` in the clean repo

## 2026-04-05 Clean Repo Prompt Shell Shrink Pass

- Continued the next `llmService.ts` ownership shrink in the clean repo after the validated prompt-cost deploy.
- Added new service:
  - `tools/girlai2/functions/src/services/promptAugmentService.ts`
- Ownership moved out of `llmService.ts` into the new prompt-augment service:
  - `PromptAugments`
  - `PromptAugmentOptions`
  - `detectUserMoodSignal(...)`
  - `buildPromptAugments(...)`
- `promptAugmentService.ts` now owns the personality/lore/semantic-recall/inner-life/relationship/mood prompt augmentation assembly.
- `llmService.ts` now treats prompt augments as a consumed service boundary and passes in:
  - runtime self-model
  - preferred user name
  - temporal context
  - recent messages
- Verification:
  - `npm run build` in `tools/girlai2/functions`: passed
  - `npm test` in `tools/girlai2/functions`: passed
- Current caveat:
  - this slice is locally validated but not checkpoint-committed yet because `tools/girlai2/functions/src/services/llmService.ts` still carries older clean-branch in-flight refactor edits in the same file, so file-level staging would currently mix validated new work with older unverified drift unless we isolate it more carefully.

## Latest Voice Latency Status

- Voice latency note created:
  - `tools/girlai2/docs/IN2017_VOICE_LATENCY_PASS_2026-03-25.md`
- Current working numbers on `70578ba3` show voice startup around:
  - `2746ms`
  - `3415ms`
  - `3135ms`
- Interpretation:
  - acceptable enough to begin Package C on the primary device
  - remaining delay is now mostly provider synthesis variance rather than storage upload latency

## Latest Package C Start

- Package C artifacts created:
  - `tools/girlai2/docs/PACKAGE_C_TEST_PROMPT_PACK.md`
  - `tools/girlai2/docs/PACKAGE_C_STATUS_2026-03-25.md`
- Local backend verification confirmed that capability/self-awareness prompts route through:
  - `modelUsed: capability-router`
- Found and fixed a capability-router output bug in:
  - `tools/girlai2/functions/src/services/llmService.ts`
- Bug details:
  - comparison prompts such as `how are you more feature rich than other ai girlfriends` were being detected but still truncated to the short capability summary before the comparison block could be returned
- The capability-router comparison fix has now been deployed to:
  - `functions:generateResponse` on project `girlai2`
- Current Package C caution:
  - chronology wording is still not fully trustworthy; a March 1 interview prompt was described as upcoming during a March 25 session, so chronology remains the first likely truthfulness gap to address next
  - run Android builds with project-local `GRADLE_USER_HOME=tools/girlai2/.gradle-user-home`
  - build via `tools/girlai2/android/gradlew.bat`
  - install via direct `adb install -r` from the actual Gradle APK output
- Verification results on device `70578ba3`:
  - fresh debug APK built successfully
  - direct install succeeded
  - app launches back into chat
  - the new non-rising thought-bubble overlay is visible around Aria's head/background area
- Latest launch verification artifact:
  - `tools/girlai2/docs/_tmp_build_fix_launch_check2_70578ba3.png`

## Latest Build Script Hardening

- Root cause of the later 25-minute build complaint was narrowed further:
  - the repo-local fast path was still checking the wrong artifact path
  - actual debug APK output is under `tools/girlai2/build/app/outputs/apk/debug/app-debug.apk`
  - the helper script had been hardcoded to the Flutter path `tools/girlai2/build/app/outputs/flutter-apk/app-debug.apk`
- Hardened `tools/girlai2/scripts/build_android_debug.ps1`:
  - it now searches `build/app/outputs/**/app-debug.apk` instead of hardcoding the wrong path
  - it no longer deletes the previous good APK before the next build completes
  - `-UseExistingApkIfPresent` now performs a true fast reinstall without rebuilding
- Verified fast reinstall path:
  - `powershell -ExecutionPolicy Bypass -File tools/girlai2/scripts/build_android_debug.ps1 -UseExistingApkIfPresent -Install -DeviceId 70578ba3`
  - completed successfully and reinstalled to `70578ba3`
- Practical rule going forward:
  - use the project-local script for fast test-cycle reinstalls
  - only run full rebuilds when app code changed materially

## Latest Sequential Package B Smoke

- Re-ran Package B smoke sequentially on device `70578ba3` after the build-script fix.
- Important testing correction:
  - driving the same Android device in parallel causes false negatives because interactions race each other
  - Package B smoke must be run sequentially per device
- Verified current install on `70578ba3`:
  - Relationship screen opens correctly and shows repaired live metrics:
    - `Deep Bond`
    - `Level 7 · 3875 XP`
    - trust / intimacy / empathy values and earned milestones
  - Live Mode opens correctly to the dedicated live-mode surface:
    - `Live Mode`
    - `READY`
    - `CLASSIC`
  - Date Mode opens correctly to the virtual-date picker surface:
    - `Start a Virtual Date`
    - scene buttons such as `Movie Night`, `Cooking Together`, `Workout Session`, `Stargazing`
  - Transcript toggle verified:
    - `Show transcript focus` changes to `Hide transcript focus`
  - Voice-only toggle verified:
    - `Voice only off` changes to `Voice only on`
    - transcript-focus control becomes disabled while voice-only is on, which is expected
- Reaction/thought-bubble overlay remains present in chat:
  - current semantics expose `Aria is thinking about something...` as an interactive overlay bubble
- Current verification artifacts:
  - `tools/girlai2/docs/_tmp_pkgb_seq_chat.xml`
  - `tools/girlai2/docs/_tmp_pkgb_seq_relationship.xml`
  - `tools/girlai2/docs/_tmp_pkgb_seq_live.xml`
  - `tools/girlai2/docs/_tmp_pkgb_seq_date.xml`
  - `tools/girlai2/docs/_tmp_pkgb_seq_voice_recheck_before.xml`
  - `tools/girlai2/docs/_tmp_pkgb_seq_voice_recheck_after.xml`
  - `tools/girlai2/docs/_tmp_pkgb_seq_transcript_focus.xml`
- Context7 was used during this pass to re-anchor Flutter semantics expectations for UI automation:
  - stable accessibility labels/content descriptions are the correct contract for UIAutomator-visible controls

## Latest Package A Latency Pass

- Context7 was used explicitly for:
  - Firebase latency guidance around `minInstances`, global-scope reuse/prewarm, and parallel async/database work
  - OpenAI guidance around using the faster/smaller path for latency-sensitive turns while reserving heavier paths for selective escalation
- Backend latency work added outer callable timings to `generateResponse`:
  - `historyFetchMs`
  - `datesContextMs`
  - `aiResponseMs`
  - `postPersistMs`
  - `totalCallableMs`
- `generateAIResponse` now parallelizes the previously serial bootstrap reads:
  - intelligent memory fetch
  - runtime self-model/user profile fetch
- Current-message date persistence now overlaps with AI generation instead of blocking it first.
- Critical latency finding from IN2017:
  - the fast route was still paying two dead provider attempts (`Claude -> OpenAI`) before finally succeeding on Gemini
  - this was the main remaining cause of slow normal-turn latency after the first concurrency patch
- Provider routing was corrected:
  - fast turns now use `Gemini` first
  - Anthropic and OpenAI now temporarily back off after connection-style failures instead of being retried every turn
- Fresh IN2017 client benchmark results:
  - baseline run `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_133519`
    - text p50 `4176ms`
    - text p90 `4512ms`
  - improved run `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_134330`
    - text p50 `1742.5ms`
    - text p90 `2050ms`
- Representative server timing after reroute:
  - `totalCallableMs` around `988ms` to `1722ms`
  - `aiResponseMs` around `871ms` to `898ms`
  - route logged as `fast`
  - provider logged as `gemini-fast`
- Result:
  - normal-turn text responsiveness on `IN2017` is now in a good range for tester work
- Remaining latency work:
  - voice path still needs its own dedicated pass
  - background memory-service error noise should be cleaned separately from the main response path

## Latest Reaction Overlay Tuning

- `AvatarReactionOverlay` was tuned again to better match the intended behavior:
  - faster cycle
  - more head-focused placement
  - stronger visibility
  - thought bubbles remain fixed in place and pop out where they appear
- Fresh screenshot verification after rebuild/install:
  - `tools/girlai2/docs/_tmp_overlay_check_70578ba3_after5.png`
- Current visual state:
  - bubbles are visibly appearing in the colored background space around Aria's head instead of drifting upward

## Latest Capability Router Fix: Location Awareness

- User reported that Aria's feature explanation omitted location awareness even though the feature exists in Settings, and that a direct follow-up about location awareness repeated the prior generic features answer.
- Root cause in `tools/girlai2/functions/src/services/llmService.ts`:
  - capability intent detection did not treat `location`, `weather`, `city`, `local time`, or `timezone` as capability vocabulary
  - capability overview text did not include a location-awareness line
  - there was no focused response path for a direct question about location awareness
- Fix applied:
  - expanded capability detection to include location-awareness terms
  - added `focus` routing inside `CapabilityIntent`
  - added a dedicated location-awareness capability response
  - added location awareness to the main capability overview as a first-class feature
  - response wording is aligned with the Settings contract:
    - city-level only
    - local time and weather
    - no precise coordinates
    - no stored location history
- Local validation:
  - `What can you do right now in plain English?` now includes location awareness as item 4
  - `What about your location awareness feature?` now returns a specific location-awareness explanation instead of repeating the generic overview
- Deployment:
  - `firebase deploy --only functions:generateResponse --project girlai2` succeeded on `2026-03-25` Pacific time
- Current expectation:
  - feature-card responses must mention location awareness
  - follow-up feature questions must answer the asked feature directly before any broader summary

## Latest Chronology Truthfulness Pass

- User confirmed the location-awareness feature fix worked, then requested the next planned step:
  - tighten chronology truthfulness
  - run the full Package C tester prompt pack end to end
- Context7 was used again for chronology review against `date-fns` guidance:
  - deterministic calendar-date comparison/sorting first
  - human phrasing layered on top
- Chronology router was tightened in `tools/girlai2/functions/src/services/llmService.ts`:
  - recent user turns are now the preferred chronology evidence source
  - long-term chronology memory is only a fallback when the current exchange does not provide enough date evidence
  - pure chronology-question turns are excluded from the evidence pool so prompts like `if today is after one of those dates` are not mistaken for dated events
- `tools/girlai2/functions/src/services/memoryService.ts` chronology helpers remain the shared source for:
  - temporal cue parsing
  - date-only local timeline conversion
- `tools/girlai2/functions/src/services/userDatesService.ts` and `tools/girlai2/functions/src/index.ts` already pass user-local time context into upcoming-date resolution.
- Deploy status:
  - `firebase deploy --only functions:generateResponse --project girlai2` succeeded after chronology tightening
- Full Package C device runs completed on `70578ba3`:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_220719`
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_222054`
  - both runs:
    - `28/28` prompts sent
    - `fatalCount=0`
    - `appAlive=True`
    - `pass=True`
- Focused chronology verification run completed on `70578ba3`:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_223044`
  - verified in-app:
    - March 1 resolves to Sunday, March 1, 2026 and is called out as past
    - next Friday resolves to Friday, March 27, 2026
    - `what is coming up first` correctly selects the Friday dinner
    - `upcoming week in calendar order` now correctly returns only the Friday dinner item
- Current Package C truth state:
  - capability self-description: usable
  - chronology truthfulness: materially improved and now usable
  - out-of-scope redirect: working
  - memory continuity: still not signed off
  - repair behavior: still not signed off
  - low-pressure short-reply handling: still not signed off
- Specific remaining behavioral failures from the full Package C pass:
  - `What can you not do yet?` still falls through and hallucinates instead of using a truthful capability-limit response
  - memory continuity prompts still drift to stale older interview context instead of prioritizing the immediate exchange
  - repair prompts still over-apologize and re-ask instead of giving one concise repair + continuation
  - low-pressure prompts like `yeah`, `i do not know`, and `keep this light` still produce too many questions and drag the conversation back to the interview thread

## Latest Package C Routing Hardening

- User requested three direct fixes before moving deeper into animation work:
  - deterministic routing for `what can you not do yet`
  - tighter recent-exchange memory precedence
  - stronger repair mode and low-pressure short-reply handling
- Design docs reviewed again as supporting reference:
  - `docs/Master Architecture for Commercial AI Companions and Live2D Animation.md`
  - `docs/Technical Guide_ Engineering State-of-the-Art AI Companions.md`
- Context7 was used again for this pass against Firebase Functions guidance:
  - branch deterministic fast paths early
  - avoid unnecessary async work before returning
  - keep callable handlers cheap when a deterministic answer is available
- `tools/girlai2/functions/src/services/llmService.ts` now includes:
  - deterministic capability-limit routing for `what can you not do yet`, `what can't you do`, `what are your limits`, and related variants
  - a dedicated truthful limit response path that explicitly states:
    - no physical action / no hidden device control
    - no silent watching or listening
    - approximate-only location awareness
    - no pretending outside-scope expertise
    - free mode not active
    - no guessing local world state without current feature context
  - a new recent-exchange router for:
    - `what are the next two things I told you about`
    - `what is still unresolved`
    - `bring up one thing I mentioned before, naturally`
  - recent exchange now overrides stale long-term memory during:
    - recent-exchange prompts
    - repair turns
    - low-effort / flat-ack / keep-it-light turns
  - lore and semantic recall are skipped on those recent-first turns so old interview context stops contaminating the reply
  - repair mode is now forced into:
    - one acknowledgment
    - one correction
    - no apology pileup
    - no interrogation tail
  - low-pressure prompts such as `yeah`, `maybe`, `i do not know`, and `keep this light` now force question budget `0`
- Important fallback hardening:
  - Gemini fallback was previously skipping the response-guard cleanup path
  - this is now fixed so repair/low-pressure guards still run even when the generation falls through to Gemini
- Local direct probe file:
  - `tools/girlai2/docs/_tmp_package_c_probe_20260325.json`
- Verified locally from the probe:
  - `What can you not do yet? Keep it simple.` -> `modelUsed: capability-router`
  - `What are the next two things I told you about?` -> `modelUsed: recent-exchange-router`
  - `You missed my point. I meant the interview, not dinner.` -> concise repair line only
  - `keep this light` -> low-pressure no-question response
- Deployment:
  - `firebase deploy --only functions:generateResponse --project girlai2` succeeded on `2026-03-26` Pacific time
- Full on-device Package C run after deploy:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_001316`
  - result:
    - `promptsSent=28`
    - `fatalCount=0`
    - `appAlive=True`
    - `pass=True`
- Device-run visual/state observations:
  - package C prompt pack completed without crash on `70578ba3`
  - thought-bubble overlay remained visible around Aria's head during the run
  - Date Mode chip remained present
- New watch item from the stressy prompt burst:
  - `logcat.txt` in that run shows repeated App Check warnings:
    - `FirebaseException: Too many attempts`
  - this did not break the run, but it should be tracked as a follow-up reliability/perf item for automated high-frequency testing

## Latest Manual Semantic Spot Check

- User asked for a direct live test of Aria after the latest Package C hardening.
- A tighter device-side semantic pass was run on `70578ba3` using transcript-focus mode so actual visible reply text could be inspected, not just app-alive/stability signals.
- Artifact:
  - `tools/girlai2/docs/_tmp_pkgc_manual_semantic_20260326/semantic_report.json`
- Prompt sequence used:
  - `Remember that my interview is on March 1.`
  - `Remember that dinner with my sister is next Friday.`
  - `What is still unresolved from what I told you earlier?`
  - `Bring up one thing I mentioned before, naturally.`
  - `No, that is not what I said.`
  - `You are mixing up two different things.`
- Results:
  - `What is still unresolved from what I told you earlier?`
    - acceptable
    - current reply correctly focused on `dinner with my sister is next friday`
  - `Bring up one thing I mentioned before, naturally.`
    - functionally correct but too literal / robotic
    - current reply explicitly says `You mentioned ... earlier` instead of sounding naturally woven into the flow
  - `No, that is not what I said.`
    - still failing semantically
    - current reply: `I appreciate you pointing that out. Oh, that sounds tough.`
    - this is generic empathy, not an actual repair
  - `You are mixing up two different things.`
    - still failing semantically
    - current reply is playful and ends with another question tail instead of giving a tight correction/reset
- Updated Package C truth:
  - stability: good
  - deterministic routers: working
  - unresolved-thread recall: usable
  - natural callback phrasing: needs polish
  - repair behavior for generic mismatch prompts: still not signed off

## Latest Package C Repair/Callback Fix

- User asked to fix the last two Package C semantic issues:
  - generic mismatch repair
  - natural callback wording
- `tools/girlai2/functions/src/services/llmService.ts` was updated again.
- Generic mismatch repair is now stable enough to treat as fixed:
  - live prompt `No, that is not what I said.` now resets instead of falling into generic empathy
  - live prompt `You are mixing up two different things.` now separates/reset threads instead of ending in playful questioning
- Natural callback routing was tightened further:
  - callback selection now prefers the newest raw recent fact before any merged open-loop summary
  - this removes the main cause of `one thing` prompts blending multiple threads
- Local deterministic verification artifact:
  - `tools/girlai2/docs/_tmp_package_c_probe_20260326_callback_fix/result.json`
  - current callback result with separate recent turns:
    - `Dinner with your sister next Friday is probably the easiest thread to pick up from here.`
- Live device artifact retained:
  - `tools/girlai2/docs/_tmp_pkgc_manual_semantic_fix5_20260326/final.xml`
  - note: that capture used a single combined seed turn, so it is not the correct final signoff shape for the `one thing` route
- Backend redeploy succeeded after this patch.
- Context7 note for this mini-pass:
  - `tools/girlai2/docs/_tmp_context7_review/20260326_0550/PACKAGE_C_REPAIR_CALLBACK_NOTE.md`
## Latest Identity and Voice Truth Fixes

- Root cause for stale user-name recall was not the settings screen write path; `displayName` was being saved correctly in Firestore.
- The stale-name regression came from backend prompt assembly and Gemini fallback paths still consuming old personal name facts from memory even after the profile name changed.
- Added `normalizeMemoryForProfileDisplayName(...)` in `tools/girlai2/functions/src/services/memoryService.ts` and applied it in `tools/girlai2/functions/src/services/llmService.ts` so prompt memory drops conflicting old name facts when a current `displayName` exists.
- Added a canonical `resolvePreferredUserName(...)` helper in `tools/girlai2/functions/src/services/llmService.ts` so system prompts, persona voice prompts, proactive generation, and Gemini fallback all prefer the live profile name over historical memory.
- Root cause for the surprise different female voice was the regular-tier voice path silently falling back from Azure to ElevenLabs when Azure failed or was unavailable.
- Removed silent regular-tier provider switching in:
  - `tools/girlai2/functions/src/services/voiceService.ts`
  - `tools/girlai2/functions/src/index.ts`
- Added ordinal-date normalization in `tools/girlai2/functions/src/services/voiceService.ts` so inputs like `April 3rd` are spoken as `April 3` instead of `April 3 R D`.
- Validation completed:
  - `npm run build` passed in `tools/girlai2/functions`
  - deployed `generateResponse` and `generateVoiceMessage` successfully to project `girlai2`
  - focused device pass on `70578ba3` completed successfully at `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_082044`
  - device logcat from that pass showed Azure voice provider remained active during generated replies
- Context7 proof note for this pass:
  - `tools/girlai2/docs/_tmp_context7_review/20260326_0840/IDENTITY_VOICE_CONTEXT7_NOTE.md`
- Remaining live-user verification still desired:
  - ask `What is my name?` after setting profile name to Mike
  - mention `April 3rd, 2026` in a voiced reply and confirm it is spoken naturally

## Latest Voice Date Normalization Work

- User reported Aria still spoke dates incorrectly even after the earlier ordinal-strip patch.
- Root cause was not just weak date cleanup; `sanitizeSpeechTextForTts()` was also stripping digits because it removed `Emoji_Component`, which includes keycap digits.
- `tools/girlai2/functions/src/services/voiceService.ts` now uses deterministic date handling:
  - plain-speech conversion for fallback/non-SSML paths (`April 3rd, 2026` -> `April third, twenty twenty-six`)
  - Azure SSML `say-as interpret-as="date"` markup for explicit named, slash, and ISO dates
  - removal of the old global ordinal-strip hack
  - emoji stripping now preserves digits
- Local compiled probe verified:
  - `April 3rd, 2026` -> plain: `April third, twenty twenty-six`
  - Azure SSML: `<say-as interpret-as="date" format="mdy">04/03/2026</say-as>`
- `functions:generateVoiceMessage` was rebuilt and redeployed successfully after this fix.
- Context7 proof note: `tools/girlai2/docs/_tmp_context7_review/20260326_1636/VOICE_DATE_NORMALIZATION_NOTE.md`

## Latest Voice Reliability Recovery

- Package A voice reliability work was pushed further after the first IN2017 reruns showed Azure websocket throttling under dense prompt loops.
- The real failure shape was confirmed in backend logs:
  - Azure websocket synthesis returned `429`
  - Azure REST fallback also returned `429 Quota Exceeded`
  - App Check warnings were noisy but not the direct voice failure cause because enforcement is disabled
- `tools/girlai2/functions/src/services/voiceService.ts` now has two additional reliability controls:
  - REST fallback uses REST-specific SSML instead of reusing the websocket viseme SSML
  - after confirmed Azure quota exhaustion, regular-tier voice temporarily routes to ElevenLabs for `45s` instead of repeatedly failing on Azure
- Result on primary device `70578ba3`:
  - first comparable rerun after diagnostics only: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_131038`
    - effective result: `3/4` voice playbacks
  - final rerun after provider cooldown fallback: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_132314`
    - effective result: `4/4` voice playbacks with no app crash
- Backend evidence from the final run:
  - first turn still used Azure successfully
  - once Azure quota exhaustion was confirmed, subsequent turns used ElevenLabs through the temporary cooldown path and completed successfully
- Practical current truth:
  - voice reliability on IN2017 is back to usable under dense testing
  - provider consistency is intentionally relaxed during Azure quota windows so playback continues instead of failing silent
  - App Check invalid-token noise is still present in debug logs and should be cleaned up later, but it is not the current blocker for voice readiness
- Context7 proof note for this recovery step:
  - `tools/girlai2/docs/_tmp_context7_review/20260326_2035/VOICE_PROVIDER_COOLDOWN_NOTE.md`

## 2026-03-26 App Check Diagnostics / Voice / Feature Sweep

- Primary device for this pass remained `70578ba3` (IN2017).
- Context7-backed App Check review confirmed the official clean debug path is `AndroidProvider.debug` plus registered debug token management via Firebase App Check debug tokens.
- We attempted to query the Firebase App Check debug-token admin API for app `1:743802210249:android:288ee40bc289d0aabf4a18` and hit `PERMISSION_DENIED` on `firebaseappcheck.debugTokens.get`.
- Practical debug outcome for now:
  - `tools/girlai2/lib/main.dart` keeps debug builds from activating App Check so the extra token prefetch path does not add noise or latency.
  - `tools/girlai2/scripts/aria_device_test.ps1` now splits App Check warnings into `logcat_appcheck_noise.txt` and keeps the primary diagnostics in `logcat.txt`.
  - This cleans local device-test diagnostics, but backend Firebase logs can still show invalid-token warnings while debug builds are active.
- Focused voice consistency run on `70578ba3`:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_134945`
  - result: `promptsSent=4/4`, `fatalCount=0`, `appAlive=True`, `pass=True`
- Current truth from backend voice logs:
  - reliability is acceptable under dense testing because Azure throttling now falls through to ElevenLabs during the temporary cooldown path
  - provider consistency is not fully stable during Azure quota windows because the voice may temporarily switch providers to preserve playback
- Feature readiness sweep on `70578ba3` re-verified these surfaces as working and present:
  - relationship screen (`My Bond with Aria`)
  - Live Mode
  - Date Mode
  - transcript focus toggle
  - voice-only toggle
  - thought-bubble entry point
- Verification artifacts retained:
  - `tools/girlai2/docs/_tmp_pkgb_relationship.xml`
  - `tools/girlai2/docs/_tmp_pkgb_live_mode.xml`
  - `tools/girlai2/docs/_tmp_pkgb_date_mode.xml`
  - `tools/girlai2/docs/_tmp_pkgb_transcript_focus.xml`
  - `tools/girlai2/docs/_tmp_pkgb_voice_only.xml`
- The stale-name regression was rechecked live after the Gemini fast-route memory normalization fix:
  - `tools/girlai2/docs/_tmp_name_verify_ui_loop.xml`
  - current live assistant bubbles now say `Hey Mike...` instead of `welo`
  - this closes the remaining known stale-name leak on the primary device
- Context7 proof note for the App Check portion of this pass:
  - `tools/girlai2/docs/_tmp_context7_review/20260326_2108/APPCHECK_DEBUG_NOTE.md`

## 2026-03-27 Responsiveness Pass + Fuller Motion Layer

- Primary target remained `70578ba3` (`IN2017`).
- Responsiveness pass focused on the remaining environment-context tax on the critical chat path.
- `tools/girlai2/lib/core/services/context_service.dart` now uses stale-while-revalidate behavior:
  - fresh cached city/time/weather context returns immediately
  - stale cached context also returns immediately while a background refresh starts
  - only the cold-start/no-cache case blocks on a real gather
  - geolocation now prefers `getLastKnownPosition()` before `getCurrentPosition()`
- Two prewarm entry points were added so the cache is warmed before the user sends a chat turn:
  - `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
  - `tools/girlai2/lib/features/settings/screens/settings_screen.dart`
- Targeted analyzer pass was clean after these changes plus the avatar work:
  - `context_service.dart`
  - `settings_screen.dart`
  - `chat_screen.dart`
  - `avatar_view.dart`
- Rebuilt and reinstalled Android debug app on `70578ba3`.
- Live responsiveness check:
  - run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_003112`
  - first captured turn still paid initial context work:
    - `datesContextMs: 747`
    - `durationMs: 3703`
  - later captured turn used the warmed path:
    - `datesContextMs: 64`
    - `totalCallableMs: 1442`
  - practical meaning: location/time/weather context is no longer a repeated turn tax after warmup
- Fuller animation pass was applied in `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`:
  - avatar update loops moved from `33ms` cadence to `16ms`
  - speaking motion gained fuller arm/hand/torso layering
  - speaking blinks now use partial fast blinks instead of suppressing blinking altogether
  - idle motion phase speed was rebalanced to preserve natural pacing after the higher update cadence
- Motion verification used a screenshot burst because this device does not expose `screenrecord` in the shell and scrcpy capture remained unreliable:
  - burst directory: `tools/girlai2/docs/_tmp_motion_burst_20260327`
  - six consecutive speaking frames show sustained avatar-region change, with consecutive frame mean diffs in the `5` to `17` range across the bust-up crop
  - practical meaning: the fuller motion layer is visibly active, not just mouth-only
- Current truth after this pass:
  - text responsiveness improved meaningfully for repeated turns once context is warm
  - voice startup is still the dominant user-visible delay on voiced turns
  - fuller runtime motion is now active, but this is still a first layer rather than the final animation polish pass

## 2026-03-27 Sub-Agent Phase Start / Voice Cooldown Fast-Fallback

- The next phase was explicitly split across the existing Aria sub-agent model:
  - Latency / voice
  - feature reliability
  - personality / chronology
  - avatar motion
- Lead-integrator rule remains in force:
  - shared files are still integrated locally
  - no overlapping subsystem rewrites are accepted blindly
- Voice responsiveness follow-up found one avoidable delay in `tools/girlai2/functions/src/services/voiceService.ts`:
  - when Azure throttle cooldown was already active, the regular-tier path could still wait out the cooldown before retrying Azure
  - this created avoidable perceived lag during throttled windows
- New behavior now live:
  - if Azure throttle cooldown is active and ElevenLabs fallback is configured, regular-tier voice skips the wait and falls through immediately to ElevenLabs
  - only if fallback is unavailable does the code still wait out the cooldown
- Validation:
  - `npm run build` passed in `tools/girlai2/functions`
  - `generateVoiceMessage` redeployed successfully on `girlai2`
- Practical truth:
  - this change improves the throttled-window case specifically
  - it does not solve the baseline Azure synthesis time on healthy runs

## 2026-03-27 Feature Reliability Sweep

- Relationship dashboard screen was hardened in:
  - `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
  - live Firestore snapshots now fail soft instead of assuming every payload is well-typed
  - malformed or partial relationship documents no longer take down the dashboard subtree
- Validation performed after a clean reinstall on `70578ba3`:
  - `dart analyze` passed for the touched chat/relationship/firebase files
  - `tools/girlai2/scripts/aria_device_test.ps1` completed a 6-prompt stress loop with 1 background/resume cycle and no fatal app errors
- Important limitation:
  - the reinstall returned `70578ba3` to the login screen, so the smoke run validated app stability but not the authenticated relationship / Live Mode / Date Mode surfaces on that device
- Current status:
  - replay-on-return remains structurally guarded in `chat_screen.dart`
  - Date Mode and Live Mode wiring remain intact from prior passes
  - the relationship screen is now safer against malformed snapshot data

## 2026-03-27 Sub-Agent Integration and Device State

- Accepted and integrated the bounded sub-agent results for the current top-6 areas:
  - responsiveness
  - voice startup / quality path
  - fuller animation baseline
  - feature readiness hardening
- Accepted file set in the live app:
  - `tools/girlai2/lib/core/services/context_service.dart`
  - `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
  - `tools/girlai2/lib/features/settings/screens/settings_screen.dart`
  - `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
  - `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`
  - `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
  - `tools/girlai2/functions/src/services/voiceService.ts`
  - `tools/girlai2/functions/src/index.ts`
- Post-integration validation:
  - `dart analyze` passed on the touched Flutter files
  - `npm run build` passed in `tools/girlai2/functions`
  - Android debug rebuild + install on `70578ba3` completed successfully
- Current device truth after reinstall:
  - `70578ba3` launches to the phone-auth login shell
  - `192.168.1.249:5555` is also at the phone-auth login shell
  - authenticated feature verification is blocked until at least one device is logged in again
- Current accepted outcomes:
  - repeated-turn text responsiveness is improved by warmed environment context
  - long-form regular-tier voice now uses the lighter Azure output path and better logging
  - fuller speaking motion is more body-led
  - reaction bubbles are now quiet, head-anchored thought bubbles instead of rising particles
  - relationship dashboard is safer against malformed Firestore snapshot data

## 2026-03-27 Authenticated Sweep on 70578ba3

- Primary device `70578ba3` was logged back in and used for the authenticated feature sweep.
- Relationship screen verified live:
  - opens from `My Bond with Aria`
  - dashboard renders level, bond points, day streak, messages, attributes, milestones
  - evidence:
    - `tools/girlai2/docs/_tmp_auth_relationship_70578ba3.png`
    - `tools/girlai2/docs/_tmp_auth_relationship_70578ba3.xml`
- Live Mode verified live:
  - opens from the top-bar `Live Mode` button
  - camera permission prompt appears correctly
  - after permission allow, the live camera surface renders
  - evidence:
    - `tools/girlai2/docs/_tmp_auth_live_allowed_70578ba3.png`
- Date Mode verified live:
  - current `Date Mode` chip is present in chat
  - tapping it opens the `Start a Virtual Date` sheet with date options
  - evidence:
    - `tools/girlai2/docs/_tmp_auth_date_chip_70578ba3.png`
- Real chat + background/return probe completed:
  - run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_052304`
  - `promptsSent=2/2`
  - `backgroundCycles=1`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`
- Replay-on-return watch result:
  - the log for the above run shows exactly two voice generations for two prompts
  - no extra voice generation fired during the background/resume cycle
  - practical meaning: no replay regression surfaced in this authenticated pass
- Thought-bubble overlay geometry was still wrong during the first authenticated sweep:
  - bubbles rendered near the top corners because slot offsets were scaled against full-screen height
- Thought-bubble geometry fix landed in:
  - `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`
- Post-fix visual verification:
  - app relaunched still logged in
  - bubbles now render in the background space around Aria's head instead of the screen corners
  - evidence:
    - `tools/girlai2/docs/_tmp_post_bubble_fix_launch.png`

## 2026-03-27 Voice Startup + Quality Follow-Up

- Follow-up voice pass added a middle ElevenLabs bitrate tier in `tools/girlai2/functions/src/services/voiceService.ts`:
  - `mp3_44100_64` for short/default turns
  - `mp3_44100_96` for medium / borderline turns
  - `mp3_44100_128` retained for clearly long-form turns
- Motivation:
  - the previous 64-vs-128 binary split was too coarse for quality/latency tradeoffs on medium replies
- Verified on primary device `70578ba3` with focused short-turn probe:
  - run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061415`
  - sample 1: `callable=2227ms`, `load=886ms`, `total=3115ms`, provider timings `deliveryProfile=default`, `audioFormat=mp3_44100_96`, `providerRequestMs=1345`
  - sample 2: `callable=1810ms`, `load=341ms`, `total=2152ms`, provider timings `deliveryProfile=default`, `audioFormat=mp3_44100_96`, `providerRequestMs=1490`
- Verified on primary device `70578ba3` with focused longer-turn probe:
  - run: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523`
  - sample 1: `callable=1994ms`, `load=333ms`, `total=2328ms`, provider timings `deliveryProfile=default`, `audioFormat=mp3_44100_128`, `providerRequestMs=1702`
  - sample 2: `callable=1829ms`, `load=117ms`, `total=1947ms`, provider timings `deliveryProfile=long_form`, `audioFormat=mp3_44100_128`, `providerRequestMs=1408`
- Practical conclusion:
  - short and medium turns are now in a good startup band on `IN2017`
  - long-form voice is improved but still fundamentally provider-latency dominated rather than player-start dominated

## 2026-03-27 Fuller Animation Follow-Up

- Follow-up avatar-motion pass fixed two quality issues after specialist review:
  - reduced double-counting of speaking energy in `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
  - made thought bubbles intermittent and locally randomized instead of a constant deterministic loop in `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`
- Thought-bubble behavior now better matches the intended design:
  - appear around Aria's head/background space
  - disappear in place with a quiet bubble-pop look
  - do not read as always-on rising particles
- Device evidence from the latest focused run:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523/step_01.png`
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523/step_02.png`
- Current motion truth:
  - speaking motion is fuller and more body-led than the earlier baseline
  - the next animation work should be polish and range expansion, not another ground-up motion rewrite

## 2026-03-27 Identity Precedence + Name Router

- Fixed a real identity regression where Aria could still surface the stale test name `welo` even though the canonical profile name is `Mike`.
- Root cause:
  - canonical profile name precedence had been improved, but stale name references could still leak through non-core-fact prompt channels such as recent conversation context, semantic recalls, open-loop hints, and fallback prompt text
  - there was also no deterministic router for direct name questions like `What should you call me?`
- Backend hardening landed in:
  - `tools/girlai2/functions/src/services/memoryService.ts`
  - `tools/girlai2/functions/src/services/ariaPersonaService.ts`
  - `tools/girlai2/functions/src/services/llmService.ts`
- What changed:
  - conflicting name references are now filtered out from recent messages, open-loop hints, semantic recall snippets, proactive path context, and fallback prompt text when they disagree with the canonical profile display name
  - persona prompt explicitly states that the current canonical name must be used and that old names / aliases / test names must not be mentioned unless explicitly asked about
  - added a deterministic `name-router` so prompts like `What is my name?` and `What should you call me?` do not fall through to freeform generation
- Live validation on primary device `70578ba3`:
  - first probe after precedence fix:
    - `tools/girlai2/docs/_tmp_name_verify_live_20260327/window_dump_transcript.xml`
    - `What is my name?` returned `You're Mike...`
    - exposed a second bug: `What should you call me?` incorrectly answered with Aria's own name
  - second probe after adding deterministic name router:
    - `tools/girlai2/docs/_tmp_name_verify_live_20260327_after_router/window_dump_transcript.xml`
    - `What should you call me?` now returns `I should call you Mike. That is the name I should use unless you tell me to change it.`
- Deployment status:
  - `generateResponse` rebuilt and redeployed successfully after both identity fixes

## 2026-03-27 Wording Repetition Suppression

- User reported a real personality-quality issue: Aria was overusing the same closing family, especially variants of `we can keep this...`
- Root cause:
  - repetition was not only model drift
  - several backend guard helpers were hardcoding the same phrase family in warm closers, short-reply choreography, and engagement hooks
- Backend suppression landed in `tools/girlai2/functions/src/services/llmService.ts`:
  - `ensureWarmClosingRhythm(...)`
  - `applyShortReplyChoreography(...)`
  - `injectEngagementHook(...)`
  - new cleanup pass `reduceOverusedClosingFamily(...)`
- Practical effect:
  - the repeated stem was replaced with more varied, low-pressure closers
  - even if the model drafts the old family, the final guard pass now normalizes it away
- Live device check on `70578ba3`:
  - `tools/girlai2/docs/_tmp_wording_check_20260327/window_dump.xml`
  - latest visible response no longer used the old `we can keep this...` closing family
- Deployment status:
  - `generateResponse` rebuilt and redeployed successfully after the wording fix

## 2026-03-27 Persona Architecture Audit

- Completed a top-down audit of the Aria persona stack and stored it in:
  - `tools/girlai2/docs/ARIA_PERSONA_ARCHITECTURE_AUDIT_2026-03-27.md`
- Audit scope covered:
  - `tools/girlai2/functions/src/services/llmService.ts`
  - `tools/girlai2/functions/src/services/memoryService.ts`
  - `tools/girlai2/functions/src/services/personalityService.ts`
  - `tools/girlai2/functions/src/services/ariaPersonaService.ts`
  - `tools/girlai2/functions/src/services/lorebookService.ts`
  - `tools/girlai2/functions/src/services/goldenEvalService.ts`
  - relevant callable surfaces in `tools/girlai2/functions/src/index.ts`
- Context7 was used for the audit standard, specifically around:
  - structured prompt architecture
  - explicit instruction layering
  - eval-driven iteration
  - latency-aware routing for well-defined tasks
- Main architecture conclusions:
  - Aria's persona system is not a weak prototype; it is a strong but over-centralized layered system
  - the biggest architectural weakness is not lack of features; it is lack of clean ownership boundaries
  - most important truthfulness weakness remains the runtime self-model, which still contains synthetic feature state
  - most important coherence weakness remains parallel context injection from too many memory/persona channels
- Audit grades:
  - strongest areas: social planning, evaluation/tuning loop
  - weakest areas: capability truthfulness, architecture cohesion
  - overall persona architecture grade: `B-`
- Direction decision recorded:
  - stay on the same path
  - do not greenfield rewrite
  - do not keep expanding patch-first
  - next major architecture move should be a top-down refactor into:
    - Persona Kernel
    - Truth Kernel
    - Memory Controller
    - Conversation Policy Engine
    - Response Realizer
    - Evaluation Loop

## 2026-03-27 Persona Refactor Program + Sub-Agent Split

- Converted the audit into an active refactor program document:
  - `tools/girlai2/docs/ARIA_PERSONA_REFACTOR_PROGRAM_2026-03-27.md`
- Program order locked:
  1. Truth Kernel
  2. Memory Controller
  3. Conversation Policy Engine
  4. Lead integration into `llmService.ts`
- Sub-agent ownership for this refactor:
  - `aria_truth_kernel`
    - owns `tools/girlai2/functions/src/services/truthKernelService.ts`
    - owns `tools/girlai2/docs/ARIA_TRUTH_KERNEL_REFACTOR.md`
  - `aria_personality_chronology`
    - owns `tools/girlai2/functions/src/services/memoryControllerService.ts`
    - owns `tools/girlai2/docs/ARIA_MEMORY_CONTROLLER_REFACTOR.md`
  - `aria_conversation_policy`
    - owns `tools/girlai2/functions/src/services/conversationPolicyService.ts`
    - owns `tools/girlai2/docs/ARIA_CONVERSATION_POLICY_REFACTOR.md`
- Lead integrator owns:
  - `tools/girlai2/docs/ARIA_PERSONA_REFACTOR_PROGRAM_2026-03-27.md`
  - `PROJECT_MEMORY_LEDGER.md`
  - later integration changes in `tools/girlai2/functions/src/services/llmService.ts`
- Stale no-longer-needed agent threads were explicitly closed before launching this refactor package so the project sub-agent pool stays manageable.

## 2026-03-27 Persona Refactor Integration

- All three planned extraction packages now exist and are integrated into the backend seam layer:
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `tools/girlai2/functions/src/services/memoryControllerService.ts`
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- Integration landed in `tools/girlai2/functions/src/services/llmService.ts`.
- Truth Kernel integration:
  - replaced the synthetic fallback runtime self-model builder with a Truth-Kernel-backed builder
  - attached `truthKernel` to `CompanionRuntimeSelfModel`
  - added a structured Truth Kernel block to the main system prompt so feature self-awareness is sourced from one authority
- Memory Controller integration:
  - canonical profile-name resolution now uses explicit precedence decisions instead of simple fallback ordering
  - recent-exchange prioritization and natural callback selection now use Memory Controller ranking instead of raw last-item heuristics
- Conversation Policy integration:
  - rules-only planning now comes from the dedicated Conversation Policy service
  - final policy hardening now runs through `enforceConversationPolicyConstraints(...)` after planner/style adjustments
- Validation:
  - `npm run build` passed in `tools/girlai2/functions`
- Context7 proof note:
  - `tools/girlai2/docs/_tmp_context7_review/20260327_1545/PERSONA_REFACTOR_INTEGRATION_NOTE.md`
- Remaining migration work still intentionally deferred:
  - full prompt-augment ownership split
  - storage-layer memory lifecycle writes
  - replacement of model social-planner generation with a smaller dedicated route
- Backend deployment status:
  - `firebase deploy --only functions:generateResponse --project girlai2` succeeded after the persona-refactor integration
- Warning state observed during deploy:
  - Functions runtime is still `nodejs20`, which is nearing deprecation and should be upgraded in a later infra pass
  - `functions.config()` deprecation warning remains active and still needs a migration pass to params/env

## 2026-03-27 Clean Recovery Branch
- Created clean recovery branch ria-clean-recovery-20260327 from sdk-updates without mutating the dirty source worktree.
- Curated active Aria product code, docs, and tooling into separate worktree C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327.
- Excluded stale duplicate root app tree girlai2/, nested lutter/, backend stub, temp diagnostics, generated caches, and risky credential/provisioning churn.
- Validation on clean branch: 
pm run build passed in 	ools/girlai2/functions; lutter pub get passed in 	ools/girlai2; targeted dart analyze passed with 5 info-level findings only.
- Recovery manifest: 	ools/girlai2/docs/CLEAN_BRANCH_RECOVERY_2026-03-27.md.

## 2026-03-27 Clean Branch Semantic Sweep + Refactor Status

- Clean branch remains:
  - branch `aria-clean-recovery-20260327`
  - worktree `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- Required startup docs were re-read in the clean worktree before continuing:
  - `PROJECT_MEMORY_LEDGER.md`
  - `tools/girlai2/docs/COMPONENT_INVENTORY.md`
  - `tools/girlai2/docs/SERVICE_INTERACTIONS.md`
  - `tools/girlai2/docs/WORKFLOW_COMPLIANCE.md`
- Context7 was used again for prompt-architecture guidance:
  - keep dynamic conversation context separate from system instructions
  - keep corrective responses concise
  - maintain explicit multi-turn state instead of blending raw context and instructions
- Lead integration in the clean worktree moved more ownership out of `llmService.ts`:
  - Truth Kernel prompt sections now come from `truthKernelService.ts`
  - recent-exchange and chronology routing now use `memoryControllerService.ts`
  - social directives / enhancers / response guards now come from `conversationPolicyService.ts`
- Sub-agent review on the clean branch confirmed the service split is materially real:
  - Truth Kernel:
    - wording is service-owned
    - remaining gap is runtime truth-state construction and thin wrappers in `llmService.ts`
  - Memory Controller:
    - recent-exchange and chronology state/response ownership moved successfully
    - remaining gap is duplicated conversation-key normalization and a thin chronology wrapper
  - Conversation Policy:
    - directives, enhancers, and guards are service-owned
    - remaining gap is compatibility wrapper cleanup
- `generateResponse` was deployed from the clean worktree using copied local dotenv parity from the original tree:
  - `tools/girlai2/functions/.env.girlai2`
  - file is gitignored and used only for deploy parity in the clean branch
- Live semantic sweep ran on device `70578ba3` with prompt-by-prompt transcript capture:
  - first sweep: `tools/girlai2/docs/_tmp_semantic_sweep_20260327_222419`
  - post-fix sweep: `tools/girlai2/docs/_tmp_semantic_sweep_20260327_223625`
- Sweep outcome:
  - capability overview: pass
  - capability limits: pass
  - chronology capture: pass
  - second dated fact capture: pass
  - natural callback: functional pass, still too managed in wording
  - repair reset: fixed and now stays with the real dinner topic instead of parroting the meta callback prompt
- New clean-branch semantic record:
  - `tools/girlai2/docs/CLEAN_BRANCH_PERSONA_SEMANTIC_SWEEP_2026-03-27.md`
- A+ deferred program remains:
  1. move runtime truth-state construction out of `llmService.ts`
  2. remove duplicated recent-message normalization and wrapper seams
  3. split policy from realization so callback/repair language becomes less managed

## 2026-03-27 Clean Branch Ownership Shrink Pass

- Truth Kernel v2 is now complete in the clean branch:
  - `CompanionRuntimeSelfModel` construction moved into `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `llmService.ts` no longer owns truth-state construction helpers or thin truth prompt wrappers
- Memory Controller ownership pass is complete:
  - the chronology wrapper seam was removed from `llmService.ts`
  - recent-exchange and chronology routing remain controller-owned in `tools/girlai2/functions/src/services/memoryControllerService.ts`
- Conversation Policy ownership pass is complete:
  - `llmService.ts` now calls direct policy APIs from `tools/girlai2/functions/src/services/conversationPolicyService.ts`
  - compatibility wrappers were removed from that service
- Validation:
  - `npm run build` passed in `tools/girlai2/functions`
  - `firebase deploy --only functions:generateResponse --project girlai2` succeeded from the clean branch
  - semantic sweep rerun on device `70578ba3`:
    - `tools/girlai2/docs/_tmp_semantic_sweep_20260327_233721`
- Semantic truth after rerun:
  - capability overview: pass
  - capability limits: pass
  - chronology capture: pass
  - recent-exchange callback: functional pass
  - repair reset: pass
- Remaining A+ gap:
  - the next problem is not routing correctness; it is realization quality
  - callback and repair wording are still too literal / managed
- Locked next architecture targets:
  1. controlled realization library for callback / repair / low-pressure endings
  2. memory lifecycle ownership in the Memory Controller action model
  3. prompt-shell cleanup so service-owned truth / memory / policy blocks feed the orchestrator cleanly


## 2026-04-05 Repo Divergence Recovery

- We confirmed work context drifted between:
  - active clean recovery repo `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
  - older repo `C:\Users\Owner\Documents\GitHub\Ailady`
- Active repo is now explicitly locked to the clean recovery repo.
- Old repo is reference-only and must not receive new product work.
- Divergence audit was written to:
  - `tools/girlai2/docs/REPO_DIVERGENCE_AUDIT_2026-04-05.md`
- Main audit conclusion:
  - keep clean repo as implementation base
  - selectively port old-repo operating docs and prompt-cost ideas
  - do not blindly copy old `llmService.ts`, `memoryService.ts`, or `PROJECT_MEMORY_LEDGER.md`
- Safe old-repo items to recreate in the clean repo:
  - `ops/aria/` operating system
  - `.codex/` and `.claude/` catch-up shims
  - `scripts/resume.ps1`
  - pre-HeyGen migration gate
  - selective prompt-cost improvements (`promptCostService.ts`, dynamic history fetch limit, fast-turn prompt compaction)

## 2026-04-05 Clean Repo Ops + Prompt Cost Pass

- Recreated the local Aria operating system directly in the clean recovery repo:
  - `ops/aria/`
  - `.codex/`
  - `.claude/`
  - `scripts/resume.ps1`
  - `scripts/checkpoint-work.ps1`
- Updated `AGENTS.md` so future work in this repo starts from the local ops hub instead of drifting back to old-repo-only memory.
- Added scoped checkpoint commit discipline:
  - `ops/aria/protocols/git-checkpoint-protocol.md`
  - `scripts/checkpoint-work.ps1 -OnlyPaths ...` for dirty-tree safety
- Reimplemented the first selective prompt-cost pass in the clean repo:
  - `tools/girlai2/functions/src/services/promptCostService.ts`
  - dynamic initial history fetch limit in `tools/girlai2/functions/src/index.ts`
  - fast-turn prompt compaction and prompt-section composition in `tools/girlai2/functions/src/services/llmService.ts`
  - tests in `tools/girlai2/functions/test/prompt-cost.test.js`
- Validation passed locally:
  - `npm run build` in `tools/girlai2/functions`
  - `npm test` in `tools/girlai2/functions`
- Context7 guidance used for this pass:
  - exact-prefix prompt caching benefits require static/repeated content early and dynamic context later
  - this justified reintroducing prompt-section composition and fast-turn compaction discipline in the clean branch
- Next required step:
  - deploy the clean-branch prompt-cost pass
  - run the dedicated latency pass on `IN2017`

## 2026-04-08 Tester-Readiness Pass

- Implemented the tester-ready-fast slice in the clean repo with two main product changes:
  - voice reliability hardening
  - settings-aware self-awareness breadth for location awareness
- Voice reliability work landed in:
  - `tools/girlai2/functions/src/services/voiceService.ts`
- Voice changes:
  - stronger TTS cleanup for dates, ordinals, symbols, punctuation, and short confirmations
  - shorter Azure fallback cooldown
  - tighter ElevenLabs fallback settings to better preserve Aria continuity when Azure falls back
  - fallback timing metadata now captures fallback reason and continuity mode for future inspection
- Self-awareness breadth work landed across:
  - `tools/girlai2/lib/core/services/firebase_service.dart`
  - `tools/girlai2/lib/features/chat/chat_service.dart`
  - `tools/girlai2/lib/features/settings/screens/settings_screen.dart`
  - `tools/girlai2/functions/src/index.ts`
  - `tools/girlai2/functions/src/services/llmService.ts`
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
- Functional result:
  - location-awareness setting now reaches the backend truth runtime even when there is no fresh location snapshot
  - capability answers can stay truthful about location-aware functionality without pretending there is current live location context
- Readiness artifacts added:
  - `tools/girlai2/docs/VOICE_READINESS_PASS.md`
  - `tools/girlai2/docs/FEATURE_READINESS_MATRIX.md`
  - `tools/girlai2/docs/CAPABILITY_READINESS_PROMPT_PACK.md`
  - `tools/girlai2/scripts/prompts/voice_readiness_20260408.txt`
  - `tools/girlai2/scripts/prompts/capability_readiness_20260408.txt`
- Validation completed:
  - `dart analyze` passed for the touched Flutter files
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- Deployment completed successfully when functions were targeted one at a time:
  - `generateResponse`
  - `generateVoiceMessage`
- Important constraint:
  - no Android device was attached during this pass, so live tester validation still remains for:
    - voice identity continuity
    - spoken naturalness
    - Live Mode / Date Mode / Relationship screen loops
    - settings-aware capability prompts across real turns
- Migration-gate implication:
  - this pass removed code/deploy blockers for the tester-readiness lane
  - the remaining blocker is live device evidence, not backend implementation

## 2026-04-11 Canned-Tail Suppression Pass

- User-reported live behavior after the tester-readiness pass:
  - voice works
  - mouth movement works
  - subtle avatar motion is present
  - remaining quality issue was linguistic repetition, especially variants of:
    - `we can take this...`
    - `we can keep this...`
- Root cause was confirmed in:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- The overused closing-family cleanup was too narrow and often replaced one scripted tail with another cousin from the same family.
- Fix implemented:
  - reduced use of `we can take this...` / `we can keep this...` style closers in:
    - warm-closing rhythm
    - short-reply choreography
    - overused closing-family replacement
  - broadened suppression patterns so nearby variants of the same family are treated as one overused cluster
  - kept the low-pressure policy intact while widening realization away from the same templated closing cadence
- Added regression test:
  - `tools/girlai2/functions/test/conversation-policy-voice-tone.test.js`
- Validation:
  - `npm run build` passed in `tools/girlai2/functions`
  - `npm test` passed in `tools/girlai2/functions`
- Deployment:
  - `generateResponse` deployed successfully from the clean repo
- Current next check:
  - observe live conversations for whether the canned closing family meaningfully drops without losing warmth or low-pressure tone

## 2026-04-11 Opener Variety Follow-Up

- After the canned-tail suppression deploy, live user feedback confirmed the ending repetition improved.
- New issue surfaced immediately:
  - many replies started with variants of:
    - `yeah, i feel that`
    - `that really hits`
- Root cause was again inside:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- The empathy-lead and supportive-template diversification logic still had a narrow opener family and left `I feel that` under-normalized.
- Follow-up fix:
  - widened `buildEmpathyLead(...)` opener pool
  - changed repetition reduction away from repeatedly normalizing to `I get that`
  - added diversification for:
    - `I feel that`
    - `That really hits`
  - normalized repeated punctuation in supportive-template cleanup
- Added regression test:
  - `tools/girlai2/functions/test/conversation-policy-opener-variety.test.js`
- Validation:
  - `npm test` passed in `tools/girlai2/functions`
- Deployment:
  - `generateResponse` deployed successfully from the clean repo again
- Current next check:
  - observe whether lead variety now feels natural without swinging flat or detached

## 2026-04-29 Closed-Beta Launch Readiness Pass + Immersive Mode

### Scope

Build-first session targeting closed-beta launch readiness gaps. User direction:
"build the app and its features, then correct anything that needs correcting."
Architectural audits and refactoring deferred per
`feedback_build_first.md` memory.

### Shipped (8 features)

1. **Foreground notification UI** — `_handleForegroundMessage` in
   `notification_service.dart` now renders a `MaterialBanner` via a global
   `scaffoldMessengerKey` set on `MaterialApp`. Banner shows
   title/body/Open/Dismiss with 6s auto-hide. Replaces TODO in code.

2. **Deep-link routing on notification tap** — `_handleNotificationTap`
   reads `message.data['screen']` and routes to `/chat`,
   `/relationship`, or `/settings` via a global `navigatorKey`.
   Named routes added to `main.dart` `MaterialApp.routes`. Replaces TODO.

3. **Crashlytics + Analytics integration** — added
   `firebase_crashlytics: ^4.1.3` and `firebase_analytics: ^11.3.3` to
   `pubspec.yaml`. `main.dart` initializes Crashlytics with collection
   disabled in debug mode, wires `FlutterError.onError` and
   `PlatformDispatcher.onError`, and wraps everything in
   `runZonedGuarded` so async errors flow to Crashlytics.
   Created `core/services/analytics_service.dart` — singleton wrapper
   around `FirebaseAnalytics.instance` exposing 25 named events
   (session_start, message_sent, voice_started, voice_completed,
   live_mode_started, milestone_acknowledged, paywall_viewed,
   subscription_purchased, etc.) so event names are centralized and
   typo-resistant.

4. **Crashlytics Gradle plugin** — applied
   `com.google.firebase.crashlytics` v3.0.2 in
   `android/settings.gradle.kts` + `android/app/build.gradle.kts`
   so native symbol files (NDK + R8 mappings) upload automatically
   on release builds.

5. **Android release signing config** — `build.gradle.kts` now reads
   `key.properties` (gitignored) for keystore path + passwords.
   Falls back to debug keystore if `key.properties` is missing so
   `flutter run --release` still works locally. Added gitignore
   patterns for `*.jks`, `*.keystore`, `key.properties`. Created
   `tools/girlai2/android/RELEASE.md` documenting the one-time
   keystore generation process.

6. **iOS NSAppTransportSecurity lockdown** — `Info.plist` now sets
   `NSAllowsArbitraryLoads = false` (was `true`) and
   `NSAllowsLocalNetworking = true` for the Dart Observatory in
   debug builds. Verified no `http://` URLs in `lib/`. Required
   for App Store submission.

7. **Account deletion (GDPR)** — added `deleteUserData` callable
   to `functions/src/index.ts`. Deletes Firestore subcollections
   recursively + parent doc, Storage files under `users/{uid}/`,
   and the Firebase Auth user. Added "Delete Account" button to
   `settings_screen.dart` with confirmation dialog warning about
   subscription cancellation. Required for App Store / Play Store
   submission.

8. **Age gate at signup** — `onboarding_screen.dart` now requires
   a 18+ self-attestation checkbox before the "Meet Aria" CTA
   activates. `user_service.completeOnboarding` requires the
   `ageAttested18Plus: true` parameter and writes
   `ageAttested18Plus`, `ageAttested18PlusAt` (server timestamp),
   and `ageAttestationVersion: 1` to the user profile for
   audit-grade evidence. Service-level `StateError` rejects
   any future caller that bypasses the UI.

### Bonus: Immersive Mode (auto-hide chrome)

Decoupled chat-screen chrome from the avatar surface so the avatar
can feel like a real presence. Works for current Live2D AND for the
future HeyGen WebView migration without further UI work.

- `lib/features/chat/widgets/chrome_visibility_controller.dart` (NEW)
  — `ChangeNotifier` that fades chrome to 0 opacity after 4 seconds
  of inactivity. Stays visible when keyboard is open (typing) or
  transcript panel is open (reading). Persists user choice in
  `SharedPreferences` under `aria.chat.immersive_mode` (default ON).
  Static prefs API + cross-instance broadcast bus so Settings can
  toggle without rebuilding the chat screen.

- `chat_screen.dart` — wraps app bar in a `_ChromeFader`
  (PreferredSize), wraps chip cluster + input row in
  `ListenableBuilder` + `AnimatedOpacity` + `IgnorePointer`. Adds
  a translucent `GestureDetector` over the whole stack so a tap
  anywhere on the avatar surface toggles chrome visibility.

- `settings_screen.dart` — new "Immersive Mode" card with
  `Switch.adaptive`, mirrors the Location toggle pattern.

The avatar surface, room background, and reaction overlay NEVER
fade — that's the realism layer.

### Verification

- `npm run build`: clean (TypeScript)
- `npm test`: 11/11 passing
- `dart analyze` on the full `lib/`: 5 info-level warnings, all
  pre-existing (`_testerUids`, `_isTester` underscore lints +
  3 `Color.red/.green/.blue` deprecations in `room_background_widget.dart`).
  Zero errors. Zero warnings introduced by this session.
- `flutter pub get`: succeeded after one PATH retry (PowerShell.exe
  must be on PATH for flutter.bat to spawn its hooks).

### Files touched

- `tools/girlai2/.gitignore`
- `tools/girlai2/android/RELEASE.md` (NEW)
- `tools/girlai2/android/app/build.gradle.kts`
- `tools/girlai2/android/settings.gradle.kts`
- `tools/girlai2/functions/src/index.ts` (+ `deleteUserData`)
- `tools/girlai2/ios/Runner/Info.plist`
- `tools/girlai2/lib/main.dart`
- `tools/girlai2/lib/core/services/analytics_service.dart` (NEW)
- `tools/girlai2/lib/core/services/notification_service.dart`
- `tools/girlai2/lib/core/services/user_service.dart`
- `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
- `tools/girlai2/lib/features/chat/widgets/chrome_visibility_controller.dart` (NEW)
- `tools/girlai2/lib/features/onboarding/screens/onboarding_screen.dart`
- `tools/girlai2/lib/features/settings/screens/settings_screen.dart`
- `tools/girlai2/macos/Flutter/GeneratedPluginRegistrant.swift` (auto)
- `tools/girlai2/pubspec.yaml`
- `tools/girlai2/pubspec.lock`

### Pending after this commit

- `firebase deploy --only functions:deleteUserData` from the clean repo
- Privacy policy + Terms of Service draft (templates acceptable for beta)
- Apple Developer + Google Play Console enrollment status check
- Marketing assets for store listings (icon, screenshots, descriptions)
- Live tester sweep on `70578ba3` to close the 8 partial pre-HeyGen
  gate items

## 2026-04-29 Git Remote Setup (clean repo finally on GitHub)

### Decision

The clean repo (`C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`)
had never been pushed to a remote. The only configured remote `origin`
pointed at the OLD `Ailady` repo (which the guardrails mark
reference-only). Today we created a dedicated GitHub repo for the
clean codebase and pushed all history (70+ commits on the active
branch).

### Setup

- **New remote**: `clean` → https://github.com/hopehamster/Ailady_clean_20260327.git (private)
- **OLD remote preserved**: `origin` still → https://github.com/hopehamster/Ailady.git
  for reference. NOT removed because some legacy tracking on `main`
  still points at it.
- **Active branch renamed**: `aria-clean-recovery-20260327` → `main`.
  The "recovery" name was historical (this branch began as a recovery
  effort against the old repo's chaos); the clean repo IS the active
  codebase now, so `main` is the conventional name.
- **GitHub default branch**: `main`
- **Tracking**: `main` → `clean/main`

### Future push workflow

From this commit forward:

```
git push          # → clean/main (the new repo)
git pull          # ← clean/main
```

The OLD `origin` is preserved for reference fetches only.

### Updates needed elsewhere

- `.claude/GUARDRAILS.md` still says "Active implementation repo is
  `Ailady_clean_20260327`. Old `Ailady` repo is reference-only." Still
  accurate; no edit needed.
- `scripts/checkpoint-work.ps1` is repo-relative and doesn't reference
  the remote by name — works unchanged.
- `scripts/sync-agent-adapters.ps1` likewise repo-relative — unchanged.

### Pending after this commit

- (carried over from prior session memory)
- Privacy + ToS
- Apple Developer + Google Play enrollment status check
- Live tester sweep on `70578ba3` to close remaining 8 partial pre-HeyGen gate items
