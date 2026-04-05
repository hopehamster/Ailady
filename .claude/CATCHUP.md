# Claude Catch-Up Entry

This folder is not the canonical project memory.

Canonical Aria memory lives in:

1. `PROJECT_MEMORY_LEDGER.md`
2. `ops/aria/README.md`
3. `ops/aria/current/mission.md`
4. `ops/aria/current/priorities.md`
5. `ops/aria/current/active-work.md`
6. `ops/aria/current/known-regressions.md`
7. `ops/aria/current/architecture-state.md`
8. `ops/aria/current/pre-heygen-migration-gate.md`
9. `ops/aria/current/tooling-state.md`
10. newest files in `ops/aria/log/`

Current immediate next step:

- validate the clean-branch prompt-cost reimplementation
- deploy and run the dedicated latency pass on `IN2017`
- then continue shrinking `tools/girlai2/functions/src/services/llmService.ts`

Do not create competing Aria state in `.claude/`.
Write durable project state to `PROJECT_MEMORY_LEDGER.md` and `ops/aria/`.
