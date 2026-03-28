# Aria Conversation Policy Refactor

This extraction moves conversational policy ownership out of `llmService.ts` and into `functions/src/services/conversationPolicyService.ts`.

## What moves

- Turn-level policy derivation:
  - question budget
  - repair mode
  - consent-aware depth
  - low-pressure / short-reply handling
  - momentum mode
  - hook style
  - closure style
- Deterministic hard-constraint enforcement after planning.

## What stays in `llmService.ts` for now

- Signal extraction from the user message and recent chat history.
- Prompt assembly and directive text generation.
- Response realization and cleanup passes.

## Migration order

1. Keep `deriveSocialSignals(...)` in `llmService.ts` initially.
2. Replace `buildRuleBasedSocialPlan(...)`, `applyPacingAndSessionAdjustments(...)`, and the final plan hardening inside `createSocialPlan(...)` with `deriveConversationPolicy(...)` plus `enforceConversationPolicyConstraints(...)`.
3. Feed the resulting policy into `buildSocialDirectives(...)` and the downstream response pipeline.
4. Leave `enforceResponseGuards(...)` in place until policy ownership is stable, then peel it apart in a later pass.

## Why this split

- `conversationPolicyService.ts` owns turn policy.
- `llmService.ts` owns prompt assembly and generation.
- That separation makes the next Aria refactor easier to reason about and safer to test.
