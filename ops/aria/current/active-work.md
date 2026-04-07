# Aria Active Work

Date: 2026-04-05

## Current State

Active implementation repo is now locked to:

- `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- branch `aria-clean-recovery-20260327`

The clean repo now has its own local operating system and the first selective prompt-cost pass has been reimplemented locally.

## Immediate Next Actions

1. Use the new low-token execution packet as the default handoff surface.
2. Continue the next `llmService.ts` shrink slice from the now-extracted `responseAssemblyService.ts` boundary.
3. Extract provider execution helpers next.
4. Keep using `ops/aria/current/pre-heygen-migration-gate.md` as the canonical migration gate.
5. Use `scripts/checkpoint-work.ps1` with `-OnlyPaths` on this dirty tree.

## Do Not Lose These Facts

- The clean repo is the only active implementation base.
- The old repo is reference-only and should not receive new product work.
- Do not blindly copy old `llmService.ts`, `memoryService.ts`, or `PROJECT_MEMORY_LEDGER.md` into this repo.
- `HeyGen WebView` remains the planned avatar upgrade direction, but not before responsiveness and feature readiness are solid.
- Prompt-cost changes now present in the clean repo:
  - `tools/girlai2/functions/src/services/promptCostService.ts`
  - dynamic initial history fetch in `tools/girlai2/functions/src/index.ts`
  - fast-turn prompt compaction in `tools/girlai2/functions/src/services/llmService.ts`
  - tests in `tools/girlai2/functions/test/prompt-cost.test.js`
- Prompt-cost validation is now complete on deployed backend:
  - deploy succeeded from clean repo
  - dedicated latency pass artifact: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260405_045306`
  - replay binary check artifact: `tools/girlai2/docs/_tmp_replay_binary_check_20260405.txt`
- Prompt-shell shrink progress after the deployed validation:
  - new service: `tools/girlai2/functions/src/services/promptAugmentService.ts`
  - prompt augmentation ownership is now moved out of `llmService.ts`
  - local build/test validation is complete
- Prompt-shell shrink progress after the current slice:
  - new service: `tools/girlai2/functions/src/services/promptShellService.ts`
  - system-prompt shell ownership is now moved out of `llmService.ts`
  - local build/test validation is complete
- Proactive shrink progress after the current slice:
  - new service: `tools/girlai2/functions/src/services/proactiveMessageService.ts`
  - proactive companion message composition is now moved out of `llmService.ts`
  - local build/test validation is complete
- Chat-mode shrink progress after the current slice:
  - new service: `tools/girlai2/functions/src/services/chatModeService.ts`
  - chat-mode overlay ownership is now moved out of `llmService.ts`
  - local build/test validation is complete
- Response-assembly shrink progress after the current slice:
  - new service: `tools/girlai2/functions/src/services/responseAssemblyService.ts`
  - main response-generation request assembly is now moved out of `llmService.ts`
  - local build/test validation is complete
