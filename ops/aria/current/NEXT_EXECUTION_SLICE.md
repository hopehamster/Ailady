# Next Execution Slice

## Title

Coordinator accepted: shift focus back to product quality and migration-gate work

## Goal

Treat the current `tools/girlai2/functions/src/services/llmService.ts` shape as the accepted stable coordinator baseline and stop shrinking it unless a future extraction offers a clear ownership win. Use the next implementation slice to improve product readiness instead of more orchestrator refactoring.

## Files Allowed To Change

- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`
- one new `ops/aria/log/YYYY-MM-DD-*.md`

## Files Not To Change

- `tools/girlai2/functions/src/services/llmService.ts` unless a later product slice explicitly requires it
- any of the extracted service modules unless a later product slice explicitly requires them
- client Flutter files under `tools/girlai2/lib/` until the next product slice is chosen
- temp artifacts under `tools/girlai2/docs/_tmp_*`

## Invariants To Preserve

- `llmService.ts` shrink phase is complete for now.
- Future extractions must be justified by real ownership improvement, not line-count pressure.
- Product quality, feature readiness, and the pre-HeyGen migration gate are now the main focus.

## Acceptance Criteria

- Memory and ops docs clearly record that the `llmService.ts` shrink phase is complete for now.
- The next real work should come from product quality or migration-gate needs, not more speculative coordinator refactoring.

## Checkpoint Instruction

- Use a scoped checkpoint commit for the docs-only decision.
