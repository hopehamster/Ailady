# Prompt Shell Extraction Checkpoint

Date: 2026-04-06
Repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
Branch: `aria-clean-recovery-20260327`

## What Changed

- Added `tools/girlai2/functions/src/services/promptShellService.ts`.
- Moved the main system-prompt shell out of `tools/girlai2/functions/src/services/llmService.ts`.
- Moved prompt-shell helper ownership with it:
  - user world block
  - visual context instructions

## Why

- `llmService.ts` still carried too much prompt-shell ownership even after prompt-cost and prompt-augment extraction.
- This slice keeps Aria behavior stable while moving the file toward a clearer coordinator role.

## Validation

- `npm run build` passed in `tools/girlai2/functions`
- `npm test` passed in `tools/girlai2/functions`

## Affected Files

- `tools/girlai2/functions/src/services/promptShellService.ts`
- `tools/girlai2/functions/src/services/llmService.ts`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`

## Unresolved Risks

- `llmService.ts` still owns more proactive-message composition than ideal.
- Older unrelated edits still exist in:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`
