# Ailady Agent Guide

## Canonical Scope

- Active app: `tools/girlai2`
- Treat repo root as orchestration and policy; treat `tools/girlai2` as the live product codebase.
- Active implementation repo is this clean recovery repo.

## Memory-First Workflow

1. Before meaningful work, read `PROJECT_MEMORY_LEDGER.md`.
2. Read the canonical repo-local Aria operations hub:
   - `ops/aria/README.md`
   - `ops/aria/current/*`
   - latest `ops/aria/log/*`
3. Query `supermemory` only if the environment can actually reach it.
4. If prior project context might matter and memory was not checked, stop and do it first.
5. After every material result, write back to:
   - `PROJECT_MEMORY_LEDGER.md`
   - relevant `ops/aria/current/*`
   - a dated `ops/aria/log/*` entry when substantial
6. If `supermemory` is available, dual-write there too.
7. Material results include decisions, constraints, regressions, fixes, feature expectations, MCP mappings, subagent assignments, tests, checkpoints, and unresolved risks.
8. If memory is missing or contradictory, repair memory before continuing.
9. After verified material results, use `scripts/checkpoint-work.ps1` so work does not stay uncommitted by accident.

## Required Startup Reads

- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/README.md`
- `ops/aria/current/mission.md`
- `ops/aria/current/priorities.md`
- `ops/aria/current/active-work.md`
- `ops/aria/current/known-regressions.md`
- `ops/aria/current/architecture-state.md`
- `ops/aria/current/pre-heygen-migration-gate.md`
- `ops/aria/current/tooling-state.md`
- `tools/girlai2/docs/COMPONENT_INVENTORY.md`
- `tools/girlai2/docs/SERVICE_INTERACTIONS.md`
- `tools/girlai2/docs/WORKFLOW_COMPLIANCE.md`

## MCP Defaults

- Libraries and APIs: `context7`
- Repo exploration: `serena`
- Backend and runtime issues: `firebase`, `dart-mcp`, `mcp_flutter`
- UI regression and browser flows: `playwright`, `chrome-devtools`, `cursor-ide-browser`
- Subscriptions and paywall surfaces: `revenuecat`
- Durable memory: `supermemory` when reachable

## Subagents

- Recover and use existing custom project subagents first.
- If no custom subagent exists for the task, follow `.cursor/rules/subagent-mcp-routing.mdc`.
- Every meaningful subagent should begin with memory retrieval and end with memory writeback.
