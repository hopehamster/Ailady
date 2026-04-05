# Prompt Shell Shrink Pass (Local Validation)

Date: 2026-04-05
Repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
Branch: `aria-clean-recovery-20260327`

## What Changed

- Added:
  - `tools/girlai2/functions/src/services/promptAugmentService.ts`
- Moved prompt augmentation ownership out of `llmService.ts`:
  - `PromptAugments`
  - `PromptAugmentOptions`
  - `detectUserMoodSignal(...)`
  - `buildPromptAugments(...)`

## Why

- This is the next safe ownership shrink after the validated prompt-cost deploy.
- It reduces `llmService.ts` responsibility without touching provider routing or the deployed latency path.
- It moves personality/lore/semantic/inner-life/relationship/mood prompt assembly behind a dedicated service seam.

## Validation

- `npm run build` in `tools/girlai2/functions`: passed
- `npm test` in `tools/girlai2/functions`: passed

## Affected Files

- `tools/girlai2/functions/src/services/promptAugmentService.ts`
- `tools/girlai2/functions/src/services/llmService.ts`
- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/active-work.md`
- `tools/girlai2/docs/ARIA_PERSONA_REFACTOR_PROGRAM_2026-03-27.md`

## Current Risk

- `llmService.ts` still has older clean-branch in-flight refactor drift in the same file.
- That means this slice is locally validated but not yet checkpoint-committed, because a file-level commit right now would mix this verified extraction with older unverified edits.

## Next Step

- isolate or reconcile the remaining `llmService.ts` drift
- then checkpoint the next validated shrink slice cleanly
