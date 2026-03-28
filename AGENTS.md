# Ailady Agent Guide

## Canonical Scope

- Active app: `tools/girlai2`
- Treat repo root as orchestration and policy; treat `tools/girlai2` as the live product codebase.

## Memory-First Workflow

1. Before meaningful work, query `supermemory` and read `PROJECT_MEMORY_LEDGER.md`.
2. If prior project context might matter and memory was not checked, stop and do it first.
3. After every material result, dual-write:
   - `supermemory.addMemory`
   - `PROJECT_MEMORY_LEDGER.md`
4. Material results include decisions, constraints, regressions, fixes, feature expectations, MCP mappings, subagent assignments, tests, checkpoints, and unresolved risks.
5. If memory is missing or contradictory, repair memory before continuing.

## Required Startup Reads

- `PROJECT_MEMORY_LEDGER.md`
- `tools/girlai2/docs/COMPONENT_INVENTORY.md`
- `tools/girlai2/docs/SERVICE_INTERACTIONS.md`
- `tools/girlai2/docs/WORKFLOW_COMPLIANCE.md`

## MCP Defaults

- Libraries and APIs: `context7`
- Repo exploration: `serena`
- Backend and runtime issues: `firebase`, `dart-mcp`, `mcp_flutter`
- UI regression and browser flows: `playwright`, `chrome-devtools`, `cursor-ide-browser`
- Subscriptions and paywall surfaces: `revenuecat`
- Durable memory: `supermemory`

## Subagents

- Recover and use existing custom project subagents first.
- If no custom subagent exists for the task, follow `.cursor/rules/subagent-mcp-routing.mdc`.
- Every meaningful subagent should begin with memory retrieval and end with memory writeback.
