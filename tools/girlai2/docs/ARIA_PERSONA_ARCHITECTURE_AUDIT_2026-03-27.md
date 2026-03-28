# Aria Persona Architecture Audit

Date: 2026-03-27
Scope: `tools/girlai2/functions/src/services/*` persona, memory, routing, and quality layers

## Review standard

This audit grades Aria against a top-down companion architecture, not just whether recent bugs were patched.

Context7 guidance used in this audit:
- OpenAI prompt structure guidance: organize instructions into clear sections such as role, personality, context, tools, conversation flow, and safety/escalation.
- OpenAI prompt guidance: keep instructions explicit, include only relevant context, and use evals to measure regressions.
- OpenAI latency guidance: combine or skip unnecessary model calls and use fast paths for well-defined routing/classification.

Relevant references:
- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/ariaPersonaService.ts`
- `tools/girlai2/functions/src/services/lorebookService.ts`
- `tools/girlai2/functions/src/services/goldenEvalService.ts`
- `tools/girlai2/functions/src/index.ts`

## Findings

### High

1. Runtime self-awareness is still partly synthetic instead of truth-backed.
   - `tools/girlai2/functions/src/services/llmService.ts:3698`
   - `tools/girlai2/functions/src/services/llmService.ts:3771`
   - `resolveSubscriptionTier()` currently collapses everything to `regular`.
   - `hasVoiceAccess` and `hasVisionAccess` are hardcoded `true`.
   - This means Aria's capability explanations can still sound truthful while being sourced from fake state.

2. Persona context is injected through too many parallel channels.
   - `tools/girlai2/functions/src/services/llmService.ts:3486`
   - `tools/girlai2/functions/src/services/memoryService.ts:2164`
   - `tools/girlai2/functions/src/services/memoryService.ts:2403`
   - `tools/girlai2/functions/src/services/llmService.ts:5576`
   - The system prompt includes:
     - legacy memory context
     - layered memory context
     - lore
     - semantic recall
     - persona voice block
     - relationship block
     - emotional memory block
     - mood block
     - recent-exchange priority block
   - That is rich, but it is not cleanly prioritized. It increases drift, repetition, contradiction risk, and token bloat.

3. The architecture is functionally layered, but operationally over-centralized.
   - `tools/girlai2/functions/src/services/llmService.ts:5221`
   - `llmService.ts` owns:
     - intent routing
     - runtime self-model
     - social planning
     - system prompt assembly
     - provider routing
     - critic pass
     - persona audit
     - emotion analysis
   - This is the core reason patch-style growth keeps happening. The architecture exists, but too much of it is trapped in one file.

### Medium

4. Intent routing is a real strength, but it is fragmented instead of unified.
   - `tools/girlai2/functions/src/services/llmService.ts:547`
   - `tools/girlai2/functions/src/services/llmService.ts:669`
   - `tools/girlai2/functions/src/services/llmService.ts:703`
   - `tools/girlai2/functions/src/services/llmService.ts:733`
   - Capability, name, chronology, and recent-exchange routers all work, but each new failure currently tends to create another specialized branch. That is manageable now, but it will become brittle.

5. Social policy is well thought out, but ownership is duplicated across layers.
   - `tools/girlai2/functions/src/services/llmService.ts:2868`
   - `tools/girlai2/functions/src/services/llmService.ts:3112`
   - `tools/girlai2/functions/src/services/llmService.ts:4327`
   - `tools/girlai2/functions/src/services/llmService.ts:4860`
   - `tools/girlai2/functions/src/services/llmService.ts:5972`
   - Question budget, repair, consent, low-pressure handling, hooks, and rewrite passes are all implemented, but behavior is determined in multiple places:
     - planner
     - post-planner adjustments
     - directive prompt layer
     - deterministic guard cleanup
     - critic rewrite
     - persona audit rewrite
   - This is powerful, but hard to reason about.

6. The persona voice system is strong, but somewhat over-instructed.
   - `tools/girlai2/functions/src/services/ariaPersonaService.ts:314`
   - `tools/girlai2/functions/src/services/llmService.ts:4203`
   - Aria has a real linguistic voice layer:
     - aria-isms
     - humor modes
     - tempo
     - name use
     - sentence variety
     - exit energy
   - The issue is not lack of personality. The issue is prompt density. Too many explicit voice directives can push output toward "managed style" instead of spontaneous style.

7. Memory is richer than average, but conflict resolution is still heuristic, not controller-based.
   - `tools/girlai2/functions/src/services/memoryService.ts:976`
   - `tools/girlai2/functions/src/services/memoryService.ts:1448`
   - `tools/girlai2/functions/src/services/memoryService.ts:1983`
   - `tools/girlai2/functions/src/services/memoryService.ts:2420`
   - This is already beyond simple RAG:
     - core facts
     - emotional moments
     - open loops
     - chronology
     - pacing profile
     - style profile
     - session arc
     - semantic memories
   - But updates still rely mostly on heuristics and prompt-time filtering rather than an explicit memory-controller contract like `ADD / UPDATE / RESOLVE / EXPIRE / SUPPRESS`.

### Low

8. Evaluation infrastructure is a major strength, but the grader is still heuristic.
   - `tools/girlai2/functions/src/services/goldenEvalService.ts:109`
   - `tools/girlai2/functions/src/services/goldenEvalService.ts:365`
   - `tools/girlai2/functions/src/services/goldenEvalService.ts:512`
   - The project already has:
     - golden prompt suite
     - strict launch gate
     - shadow benchmarks
     - feedback capture
     - weekly tuning reports
   - That is excellent for a solo product. The weakness is that a lot of scoring still depends on marker heuristics instead of deeper scenario-specific evaluators.

9. Some persona-facing outputs still contain static examples that age badly.
   - `tools/girlai2/functions/src/services/llmService.ts:1449`
   - Example demo prompts still reference `March 1`, which is a small issue, but it shows that some persona-facing content is still hardcoded instead of derived.

## Grades

| Subsystem | Grade | Why |
|---|---:|---|
| Core identity / tone contract | B+ | Strong emotional identity and boundaries; prompt shape is good, but a bit overstuffed. |
| Linguistic voice / distinctiveness | B | Real voice system exists, but it is instruction-heavy and still needs better generative variance. |
| Capability self-awareness | C+ | Routing is good; truth source is not strong enough yet. |
| Memory architecture | B | Rich multi-layer memory, but precedence and conflict resolution are too diffuse. |
| Chronology / date awareness | B | Dedicated chronology layer is real and useful; still heuristic rather than canonical. |
| Social planning / pacing | A- | This is one of the strongest parts of the stack. |
| Repair behavior | B | Real repair logic exists, but it has required repeated tightening because ownership is split. |
| Consent-aware depth control | B+ | Present and explicit in planner/directives; needs stronger architecture centrality. |
| Topic choreography / short-reply handling | B | Good rules exist, but some output still requires cleanup passes. |
| Proactive / relationship continuity | B | Good infrastructure exists, but it is not yet the clean center of the experience. |
| Inner life / opinions / lorebook | B | Promising and differentiated; still adjunctive rather than central. |
| Evaluation / feedback / tuning | A- | Strongest operational advantage in the codebase. |
| Maintainability / architecture cohesion | C+ | Strong components, weak centralization boundaries. |

## Overall grade

Overall persona architecture grade: **B-**

That is not a weak system. It is a system with strong ingredients and weak top-down consolidation.

## Direction decision

Recommendation: **stay on the same path, but stop expanding it patch-first.**

Do not replace the stack.
Do not do a greenfield rewrite.
Do not switch to a completely new framework.

The right move is a **top-down persona architecture refactor inside the current system**.

## Recommended target architecture

### 1. Persona Kernel
- Owns:
  - identity
  - tone
  - boundaries
  - accepted affection style
  - name-use policy
- Inputs:
  - canonical user profile
  - relationship stage
- Output:
  - a compact persona contract, not a giant mixed prompt

### 2. Truth Kernel
- Owns:
  - runtime self-model
  - feature availability
  - subscription/access model
  - timeline anchor
  - location-awareness status
- Must be fully deterministic.
- No prompt-time guessing.

### 3. Memory Controller
- Owns:
  - fact updates
  - contradiction resolution
  - open-loop lifecycle
  - chronology lifecycle
  - stale suppression
- Required actions should be explicit:
  - `ADD`
  - `UPDATE`
  - `RESOLVE`
  - `EXPIRE`
  - `SUPPRESS`

### 4. Conversation Policy Engine
- Owns:
  - question budget
  - repair mode
  - consent depth
  - topic choreography
  - low-pressure handling
  - momentum mode
- This should become the single owner of conversational policy.

### 5. Response Realizer
- Owns:
  - first-pass generation
  - deterministic cleanup
  - critic rewrite
  - persona audit rewrite
  - emotion tagging
- This layer should not also own truth or memory policy.

### 6. Evaluation Loop
- Owns:
  - golden suite
  - thumbs feedback
  - shadow benchmarks
  - weekly tuning
- Keep this path. It is one of the best parts of the architecture.

## Concrete recommendation

The right direction is:

1. Keep the existing persona stack.
2. Refactor it into explicit kernels and controllers.
3. Move truth, memory precedence, and policy out of the monolith.
4. Only after that, continue expanding personality depth.

If you keep adding features without this refactor, Aria will keep improving in bursts but regressing in credibility and coherence.

If you refactor first, the same feature work becomes safer, faster, and more consistent.
