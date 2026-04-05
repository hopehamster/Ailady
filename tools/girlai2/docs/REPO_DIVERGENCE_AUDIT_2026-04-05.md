# Repo Divergence Audit

Date: 2026-04-05
Active repo: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
Reference-only repo: `C:\Users\Owner\Documents\GitHub\Ailady`

## Purpose

This audit exists because work context drifted between the clean recovery repo and the older working repo. From this point forward, the clean recovery repo is the only active implementation repo for Aria work unless an explicit migration decision says otherwise.

## Active Repo Lock

- Active implementation repo: `Ailady_clean_20260327`
- Active branch: `aria-clean-recovery-20260327`
- Old repo `Ailady` is now reference-only
- No new product changes should be made in the old repo
- Any useful old-repo work must be ported intentionally after file-by-file review

## What was compared

High-risk product files:

- `PROJECT_MEMORY_LEDGER.md`
- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/lib/core/services/firebase_service.dart`
- `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
- `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`

Repo-operating surfaces:

- `ops/aria/`
- `.codex/`
- `.claude/`
- `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`
- `tools/girlai2/docs/ARIA_SUBAGENT_OPERATING_MODEL.md`
- `tools/girlai2/docs/ARIA_ANIMATION_CAPABILITY_MATRIX.md`

## Findings

### Same or effectively aligned

These files are currently identical across both repos and do not need reconciliation work:

- `tools/girlai2/lib/core/services/firebase_service.dart`
- `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
- `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
- `tools/girlai2/docs/ARIA_SUBAGENT_OPERATING_MODEL.md`
- `tools/girlai2/docs/ARIA_ANIMATION_CAPABILITY_MATRIX.md`

### Diverged and must not be blindly copied

These files differ materially and should not be replaced wholesale:

- `PROJECT_MEMORY_LEDGER.md`
- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`

### Only in the old repo

These operating-system artifacts exist only in the older repo:

- `ops/aria/`
- `.codex/`
- `.claude/`
- `tools/girlai2/functions/src/services/promptCostService.ts`

### Only in the clean repo

The clean repo already contains the more advanced active backend persona work and should remain the implementation base:

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/docs/ARIA_PERSONA_REFACTOR_PROGRAM_2026-03-27.md`
- in-progress clean-branch semantic sweep artifacts and notes

## Recommendation

Use the clean repo as the product source of truth and port only the useful deltas from the old repo.

## Safe-to-port items from the old repo

### 1. Repo operating system and memory discipline

These should be recreated in the clean repo because they improve continuity without risking product regressions:

- `ops/aria/` structure
- `.codex/` catch-up shim
- `.claude/` catch-up shim
- `scripts/resume.ps1`
- stricter memory/writeback protocol
- pre-HeyGen migration gate and readiness inventory

### 2. Prompt-cost work, selectively reimplemented

Do not copy the old `llmService.ts` or `memoryService.ts` whole. Instead, selectively port these ideas into the clean repo:

- `promptCostService.ts`
- dynamic initial history fetch limit in `functions/src/index.ts`
- compact heavy prompt augment behavior for fast turns
- stable-prefix / dynamic-context prompt assembly ordering

This should be reimplemented against the clean repo's current service seams, not cherry-picked blindly.

### 3. Token-cost heuristics, only after clean-branch review

The old repo has a rules-first memory-cost pass. That may still be useful, but it must be reviewed against the clean repo's current `memoryService.ts` before landing because the clean repo already has a different backend architecture state.

## Do not port from the old repo as-is

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `PROJECT_MEMORY_LEDGER.md`

Reason:

- The clean repo already contains later persona-refactor integration work.
- Blind replacement would likely undo the clean branch's service ownership progress.
- The old repo's memory and ops docs reflect a different working context.

## Immediate next steps

1. Keep all new implementation work in `Ailady_clean_20260327`
2. Recreate the repo operating system in the clean repo:
   - `ops/aria/`
   - `.codex/`
   - `.claude/`
3. Port the pre-HeyGen migration gate into the clean repo
4. Reimplement the prompt-cost improvements in the clean repo:
   - `promptCostService.ts`
   - dynamic history fetch limit
   - fast-turn prompt compaction
5. Continue responsiveness and persona-quality work only after the clean repo has that operating structure

## Decision

The clean recovery repo is now locked as the active Aria implementation base. The old repo remains a reference source for selective backports only.
