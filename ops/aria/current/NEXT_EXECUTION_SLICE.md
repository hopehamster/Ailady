# Next Execution Slice

## Title

Extract proactive companion message composition out of `llmService.ts`

## Goal

Move proactive companion message prompt/composition logic out of `tools/girlai2/functions/src/services/llmService.ts` into a dedicated service so `llmService.ts` keeps shedding orchestration weight without changing runtime behavior.

## Files Allowed To Change

- `tools/girlai2/functions/src/services/llmService.ts`
- one new or existing prompt-shell service under `tools/girlai2/functions/src/services/`
- one new or existing proactive-message service under `tools/girlai2/functions/src/services/`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/active-work.md`
- one new `ops/aria/log/YYYY-MM-DD-*.md`

## Files Not To Change

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/functions/src/services/memoryControllerService.ts`
- `tools/girlai2/functions/src/services/promptShellService.ts` unless a tiny import adjustment is required
- client Flutter files under `tools/girlai2/lib/`
- temp artifacts under `tools/girlai2/docs/_tmp_*`

## Invariants To Preserve

- Output behavior must stay functionally the same.
- Capability truthfulness must not regress.
- Chronology handling must stay exact and non-robotic.
- Repair mode must stay concise and non-defensive.
- Fast-turn routing and prompt-cost behavior must remain intact.
- Proactive messaging behavior must remain warm, optional, and low-pressure.
- No new broad prompt/history loading should be introduced.

## Acceptance Criteria

- `llmService.ts` no longer owns the main proactive companion message composition body.
- The extracted service has a clear boundary and does not absorb provider routing.
- `npm run build` passes.
- `npm test` passes.
- Memory and ops docs reflect the new ownership state.

## Verification Commands

- `Set-Location tools/girlai2/functions`
- `npm run build`
- `npm test`

## Checkpoint Instruction

- Use a scoped checkpoint commit only for the verified slice.
- Prefer:
  - `scripts/checkpoint-work.ps1 -Message "Checkpoint proactive message extraction" -OnlyPaths <verified paths>`
