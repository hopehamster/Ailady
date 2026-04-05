# 2026-04-05 Clean Repo Ops + Prompt Cost Pass

## What changed

- Recreated the local Aria operating system in the clean recovery repo.
- Added `ops/aria/` with current-state docs, protocols, Codex profile templates, and skills README.
- Added `.codex/` and `.claude/` catch-up shims.
- Added `scripts/resume.ps1`.
- Added `scripts/checkpoint-work.ps1` and `ops/aria/protocols/git-checkpoint-protocol.md` for scoped checkpoint commits.
- Reintroduced the selective prompt-cost pass into the clean repo:
  - `tools/girlai2/functions/src/services/promptCostService.ts`
  - dynamic initial history fetch limit in `tools/girlai2/functions/src/index.ts`
  - fast-turn prompt compaction and prompt-section composition in `tools/girlai2/functions/src/services/llmService.ts`
  - tests in `tools/girlai2/functions/test/prompt-cost.test.js`
- Updated `AGENTS.md` so this repo's startup path uses the local operations hub.

## Why

- Work drifted between two repos.
- The clean repo needed its own canonical local memory and startup path.
- Commit discipline needed to be explicit and scriptable so meaningful work does not stay uncommitted by accident.
- Prompt-cost improvements from the older repo needed to be ported selectively, not by overwriting the clean branch's newer persona refactor.

## Affected files

- `AGENTS.md`
- `ops/aria/*`
- `.codex/*`
- `.claude/*`
- `scripts/resume.ps1`
- `scripts/checkpoint-work.ps1`
- `scripts/use-codex-aria.ps1`
- `scripts/use-codex-general.ps1`
- `tools/girlai2/functions/src/services/promptCostService.ts`
- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/test/prompt-cost.test.js`
- `tools/girlai2/functions/package.json`

## Validation

- `npm run build` passed in `tools/girlai2/functions`
- `npm test` passed in `tools/girlai2/functions`
- Context7 used for prompt caching guidance: keep stable/shared prompt content early and dynamic context later, and use consistent cache keys when supported.

## Unresolved risks

- The clean-branch prompt-cost pass is not deployed yet.
- Dedicated latency validation on `IN2017` still needs to run on the deployed path.
- The repo still contains pre-existing uncommitted clean-branch work, so scoped commits should use `-OnlyPaths`.
