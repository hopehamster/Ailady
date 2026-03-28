# Aria Persona Refactor Program

Date: 2026-03-27
Scope: `tools/girlai2/functions/src/services/*`
Status: active lead-integration program

## Objective

Refactor Aria's persona stack from layered patch accumulation into a cleaner top-down architecture without a greenfield rewrite.

The program is intentionally staged:

1. Truth Kernel
2. Memory Controller
3. Conversation Policy Engine
4. Lead integration into `llmService.ts`
5. Regression checks against current personality/feature expectations

## Why this program exists

The current system is strong enough to keep, but too centralized and too patch-prone.

Main structural issues:
- runtime self-awareness is partly synthetic
- memory/context precedence is distributed across too many layers
- conversation policy is duplicated between planner, guards, and rewrite passes

## Work packages

### Package TK: Truth Kernel

Owner:
- worker `aria_truth_kernel`

Write scope:
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/docs/ARIA_TRUTH_KERNEL_REFACTOR.md`

Purpose:
- create a deterministic source of truth for:
  - identity-facing runtime state
  - feature availability
  - access model
  - timezone / local anchor
  - location-awareness status

Lead integration target:
- replace or shrink the current runtime self-model logic in `llmService.ts`

### Package MC: Memory Controller

Owner:
- worker `aria_personality_chronology`

Write scope:
- `tools/girlai2/functions/src/services/memoryControllerService.ts`
- `tools/girlai2/docs/ARIA_MEMORY_CONTROLLER_REFACTOR.md`

Purpose:
- formalize memory lifecycle decisions:
  - `ADD`
  - `UPDATE`
  - `RESOLVE`
  - `EXPIRE`
  - `SUPPRESS`
- create explicit precedence rules for:
  - canonical profile truth
  - recent exchange vs stale memory
  - chronology vs unanchored recall

Lead integration target:
- replace distributed precedence/filter heuristics in `llmService.ts` and parts of `memoryService.ts`

### Package CP: Conversation Policy Engine

Owner:
- worker `aria_conversation_policy`

Write scope:
- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/docs/ARIA_CONVERSATION_POLICY_REFACTOR.md`

Purpose:
- centralize conversational policy ownership for:
  - question budget
  - repair mode
  - consent-aware depth
  - low-pressure short replies
  - momentum mode
  - closure style
  - hook style

Lead integration target:
- replace duplicated policy decisions currently spread across:
  - planner
  - plan adjustments
  - directive construction
  - guard cleanup

## Merge order

Mandatory merge/integration order:

1. Truth Kernel
2. Memory Controller
3. Conversation Policy Engine
4. `llmService.ts` integration

Reason:
- truth must be canonical before memory precedence can rely on it
- memory precedence should be defined before policy depends on conversation context quality
- policy extraction should happen before a broader prompt rewrite

## Non-goals for this phase

- no full rewrite of `generateAIResponse`
- no provider-routing redesign
- no animation work
- no frontend feature expansion
- no new persona feature surface until these architecture seams are cleaner

## Success criteria

This phase is successful if:

1. persona truth is sourced from a deterministic kernel
2. recent-exchange and canonical-profile precedence are no longer scattered ad hoc
3. repair / consent / question-budget policy has one clear owner
4. `llmService.ts` becomes smaller in responsibility even if still large in size
5. existing tester-visible behavior does not regress

## Lead integrator responsibilities

The lead integrator must:
- keep worker write scopes disjoint
- reject abstractions that are elegant but not yet consumable
- integrate incrementally instead of doing a one-shot rewrite
- preserve current product behavior where already fixed

## 2026-03-27 Integration status

Integrated now:
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/functions/src/services/memoryControllerService.ts`
- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- lead wiring in `tools/girlai2/functions/src/services/llmService.ts`

What was wired:
- Truth Kernel now builds the runtime self-model instead of the old synthetic self-model path.
- `llmService.ts` now carries a `truthKernel` on `CompanionRuntimeSelfModel`.
- The system prompt now includes a Truth Kernel block and explicitly uses it as the authority for feature answers.
- Conversation Policy now owns:
  - rules-only fallback plan generation
  - final hard-constraint enforcement after planner/model/style adjustments
- Memory Controller now participates in:
  - canonical profile-name resolution
  - recent-exchange prioritization / natural callback selection

What is intentionally not migrated yet:
- full prompt-augment assembly is still in `llmService.ts`
- storage-layer memory writes and lifecycle mutations still live in `memoryService.ts`
- model-planner JSON generation still exists; the policy engine currently constrains it instead of replacing it

Validation:
- `npm run build` passed in `tools/girlai2/functions`
- Context7 integration note:
  - `tools/girlai2/docs/_tmp_context7_review/20260327_1545/PERSONA_REFACTOR_INTEGRATION_NOTE.md`

## 2026-03-27 Clean-Branch verification

Clean-branch semantic verification record:
- `tools/girlai2/docs/CLEAN_BRANCH_PERSONA_SEMANTIC_SWEEP_2026-03-27.md`

What the live sweep proved on `70578ba3`:
- capability overview and capability limits survived the refactor
- chronology capture survived the refactor
- recent-exchange callback now selects the correct newer dinner thread
- repair no longer falls back to the previous meta callback prompt

What still blocks A+:
- callback wording still sounds too managed
- repair wording is now correct but still literal
- `llmService.ts` still owns runtime truth construction and a few wrapper seams

Locked next architecture moves:
1. Truth Kernel v2:
  - move runtime truth-state construction out of `llmService.ts`
  - add volatile-state freshness and confidence
2. Memory Controller v2:
  - remove duplicated conversation-key normalization
  - migrate chronology wrapper ownership fully into the controller
  - add action-oriented memory lifecycle ownership
3. Conversation Policy v2:
  - split policy from realization
  - replace deterministic callback/repair phrasing with a controlled realization library
4. Prompt shell cleanup:
  - move prompt augment ownership behind the three new services and keep `llmService.ts` as coordinator only
