# Aria Operations Hub

Canonical project memory and catch-up path for Aria lives here.

Use this when:

- chat history is gone
- a different LLM needs to get caught up
- you need to know current priorities before changing code

## Read Order

1. `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
2. `ops/aria/current/NEXT_EXECUTION_SLICE.md`
3. `ops/aria/current/EXECUTION_CHECKLIST.md`
4. `PROJECT_MEMORY_LEDGER.md`
5. `ops/aria/current/mission.md`
6. `ops/aria/current/priorities.md`
7. `ops/aria/current/active-work.md`
8. `ops/aria/current/known-regressions.md`
9. `ops/aria/current/architecture-state.md`
10. `ops/aria/current/pre-heygen-migration-gate.md`
11. `ops/aria/current/tooling-state.md`
12. newest files in `ops/aria/log/`

If another model lands in `.codex/` or `.claude/`, those folders should point here instead of maintaining parallel memory.
Generated adapter files in `.codex/` and `.claude/` are refreshed by `scripts/sync-agent-adapters.ps1`.

## Scope

- Active product: `tools/girlai2`
- Repo root is orchestration and memory
- `tools/girlai2` is the live Aria product

## Current Immediate Next Step

- follow `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- continue shrinking `tools/girlai2/functions/src/services/llmService.ts`
- use `ops/aria/current/pre-heygen-migration-gate.md` as the canonical gate before serious `HeyGen WebView` implementation

## Fast Catch-Up Outcome

After reading the files above, an agent should be able to answer four questions before touching code:

1. What is Aria currently trying to achieve?
2. What changed most recently?
3. What must happen next?
4. What known risks or regressions must be protected during the next pass?

## Rules

- `PROJECT_MEMORY_LEDGER.md` is the canonical high-level memory
- `ops/aria/current/*` is the canonical latest-state operational memory
- `ops/aria/log/*` is the append-only checkpoint trail
- `supermemory` is helpful but not the sole source of truth
- repo-local operating patterns harvested from global agent setups should be normalized into `ops/aria/protocols/*`, not duplicated as competing `.claude` or `.codex` truth
