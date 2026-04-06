# Proactive Message Extraction Checkpoint

Date: 2026-04-06
Repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
Branch: `aria-clean-recovery-20260327`

## What Changed

- Added `tools/girlai2/functions/src/services/proactiveMessageService.ts`.
- Moved proactive companion message prompt assembly out of `tools/girlai2/functions/src/services/llmService.ts`.
- Kept the OpenAI call, send bookkeeping, and emotion fallback in `llmService.ts`.

## Why

- `llmService.ts` still carried proactive prompt/composition logic after prompt-cost, prompt augment, and prompt-shell extractions.
- This slice reduces orchestration weight without broadening the refactor into provider or policy ownership.

## Validation

- `npm run build` passed in `tools/girlai2/functions`
- `npm test` passed in `tools/girlai2/functions`

## Affected Files

- `tools/girlai2/functions/src/services/proactiveMessageService.ts`
- `tools/girlai2/functions/src/services/llmService.ts`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`

## Unresolved Risks

- `llmService.ts` still owns chat-mode overlay and other special-mode prompt handling.
- Older unrelated edits still exist in:
  - `tools/girlai2/functions/src/services/conversationPolicyService.ts`
  - `tools/girlai2/functions/src/services/truthKernelService.ts`
  - `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`
