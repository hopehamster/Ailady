# Aria Priorities

Date: 2026-06-26

## Active Priorities

0. **Real Project Tracking** — GitHub Project `Aria Product OS` + GitHub issues are now the execution board. Keep `ops/aria/current/project-tracking.md`, dispatch sheets, Obsidian, and issue status aligned.
1. **Web-First Launch Roadmap** — `ops/aria/current/web-roadmap.md` is the roadmap for the pivot from mobile/Flutter to root web/worker.
2. **Production Auth/Security Gate** — CORS, auth spike integration, worker rate limits, and CI-usable security gates must land before public beta.
3. **Psyche Readiness** — Diagnose → tune → body-fidelity via vast virtual testing. The "is the psyche ready for the body?" gate.
4. **Web Product Shell** — Move from lab bench UI to authenticated, responsive, production-quality browser product.
5. **Body + Voice** — Preserve Avaturn + TalkingHead as the lead path unless new verified evidence supersedes it; HeyGen/Tavus are fallback/reference paths.
6. Keep `Ailady_clean_20260327` as the only active implementation repo.

## Recently Completed

- 2026-07-01 audit created `ops/aria/current/web-roadmap.md`, `ops/aria/protocols/web-first-multi-agent-execution.md`, and GitHub issues #11-#28.
- Codex/global-local catch-up clarified that current execution has shifted to the web/worker root workspace.
- Project tracking protocol and GitHub Project setup initiated for the current waves.
- Aria Talking Loop (chat → emotion → speech) — committed e7cde7a
- Full Playwright E2E suite for apps/web — committed e7cde7a
- Prompt-shell shrink: 9 services extracted from llmService.ts
- Clean-branch ownership shrink pass for Truth Kernel, Memory Controller, Conversation Policy
- Repo divergence audit locking clean branch as active implementation base
- Local Aria operations hub recreated in clean repo

## Blocked / Waiting

- Psyche readiness: Phase A diagnosis + Phase B engine build (in progress)
- Security volley: Phase 0 tooling + attack range setup (in progress)
- Both plans are in `.claude/plans/melodic-fluttering-flame.md` — migrate to `docs/superpowers/plans/` per new PM protocol

## Deferred But Still Important

- Controlled realization library for callback / repair / low-pressure endings
- Memory lifecycle ownership in the Memory Controller action model
- Fuller animation push after stability, speed, and feature readiness stay solid
- Body-fidelity deepening (Phase D of psyche readiness — emotion intensity + voice prosody)
- Cartesia prosody wiring (requires Context7 verification of API surface)
