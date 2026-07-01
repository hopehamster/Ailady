---
type: session
issue: "#29 (companion); plan-approved ops-adapter hardening"
created: 2026-07-01
agent: claude
---

# Claude Ops Adapter Hardening + `.claude` leverage fix

## Goal
Bake GitHub+Obsidian tracking into Claude's Aria operation (seamless session-switching, hard to forget) and path-scope the marketing rules out of coding sessions. Plan survived 6 review passes + a Codex whole-repo audit before approval.

## Work done
- **Phase 1 (global `~/.claude/rules`, outside repo):** path-scoped 22 marketing/video/ads/legal rules (19 new `paths:` frontmatter, 2 extension-globs removed from cinematic-hero-video + remotion-capabilities, legal-tv already clean); kept `ai-profit-lab` + `ai-knowledge-feed` global. Verified none carry Aria-matching globs.
- **Phase 2 (repo):** `ops/aria/protocols/execution-loop.md` (single loop canon — no parallel truth); `CLAUDE.md` (auto-load anchor, ONE-CURRENT-TRUTH = GitHub P0 queue not plan files); 4 pwsh scripts (catchup / checkpoint-guard / archive-transcript / session-end, all reading stdin JSON); SessionStart+Stop+SessionEnd hooks in `.claude/settings.json`; gitignore for marker+transcripts; `.claude/WORKFLOW.md` + `.codex/WORKFLOW.md` → thin pointers.
- **Phase 3/4:** refreshed `aria-checkpoint` skill (web gate replacing Flutter pre-flight; log/archive/index/gh-comment; requires issue#+paths; never auto-commits from a hook); new `/aria-catchup` skill; `ops/aria/log/index.md` (newest-first, OKF cherry-pick).

## Files changed
Committed in `fa1f087` (13 files): CLAUDE.md · ops/aria/protocols/execution-loop.md · ops/aria/log/index.md · scripts/{claude-catchup,claude-checkpoint-guard,archive-transcript,claude-session-end}.ps1 · .claude/WORKFLOW.md · .codex/WORKFLOW.md · .claude/skills/{aria-catchup,aria-checkpoint}/SKILL.md · .claude/settings.json · .gitignore. Global (uncommitted, outside repo): 22 `~/.claude/rules/*.md`.

## Commands + evidence
- Marker/guard tested: SILENT after marker → REMINDS on new untracked file → SILENT after revert. ✓
- `settings.json` valid JSON (5 hook events). Catch-up prints the live 8-issue P0 queue. ✓
- Staged-set safety check: no product source / do-not-touch / node_modules. Post-commit: ARIA_CURRENT_TASK_BOARD.md + psycheStateService.ts still dirty (correctly deferred). ✓
- Enforcement DOWNGRADED per Codex/hook-docs: hard session-end block is impossible in Claude Code hooks → owner chose best-achievable soft enforcement.

## Decisions
- Marketing-rule scoping stays GLOBAL (only place scoping can live) — owner confirmed continuing.
- Product WIP + the whole-node_modules leak + spikes → surfaced to **#29**, NOT resolved inline (does not block the P0 queue).
- `.codex/WORKFLOW.md` de-duplicated to a pointer (execution-loop.md is a faithful superset — no functional change to Codex).

## Open items
- Hooks take effect NEXT session (read at session start) — verify SessionStart catch-up auto-fires then.
- Verify the existing PreToolUse do-not-touch guard actually fires (env-var vs stdin) — tracked in #29.

## Next
Return to the live P0 queue: #1 CORS · #11 CI · #13 auth spike · #9 rate limits · #15 psyche warm-fallback (≈ the psyche plan's H3 fix).
