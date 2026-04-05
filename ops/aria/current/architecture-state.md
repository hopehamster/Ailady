# Aria Architecture State

Date: 2026-04-05

## Backend Persona Architecture

Current major service seams:

- `truthKernelService.ts`
- `memoryControllerService.ts`
- `conversationPolicyService.ts`
- `promptCostService.ts`

Still-central coordinator:

- `tools/girlai2/functions/src/services/llmService.ts`

Assessment:

- the architecture direction is correct
- the clean branch already contains the meaningful ownership shrink pass
- `llmService.ts` is still too large and should continue shrinking

## Prompt-Cost State

The clean repo now contains the first selective prompt-cost reimplementation:

- `promptCostService.ts`
- compact initial history fetch sizing
- fast-turn prompt compaction
- prompt-section composition helper

Validation so far:

- `npm run build` passed in `tools/girlai2/functions`
- `npm test` passed in `tools/girlai2/functions`

## Next Architecture Move

Deploy the prompt-cost pass, validate latency on `IN2017`, then continue moving prompt-policy and prompt-context ownership out of `llmService.ts` while preserving the clean branch's current truth, memory, and policy seams.

## Avatar Direction

- The next major avatar upgrade path is `HeyGen WebView`.
- Treat this as the planned replacement/upgrade direction for fuller avatar capability after current responsiveness and feature-readiness work is stable.
- Do not let the HeyGen direction interrupt the current prompt-cost, latency, and feature-readiness queue.
- Migration readiness should be judged against:
  - `ops/aria/current/pre-heygen-migration-gate.md`
