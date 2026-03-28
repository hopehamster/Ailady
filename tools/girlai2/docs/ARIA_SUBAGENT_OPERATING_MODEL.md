# Aria Sub-Agent Operating Model

Date: 2026-03-25
Scope: `tools/girlai2` only

## Purpose

This document defines the exact sub-agent structure for Aria development so we can move faster without fragmenting the product.

This is a project-local operating model for `Ailady/tools/girlai2`. It is not intended for other repos.

## Governing Rules

1. One lead integrator owns final product coherence.
2. Sub-agents are specialists, not independent architects.
3. Each sub-agent has an explicit write scope.
4. No two sub-agents should edit the same file set in the same work package unless the lead explicitly sequences the handoff.
5. Each sub-agent must produce:
   - changed files
   - validation performed
   - unresolved risks
   - ledger update summary
6. The lead integrator decides merge order and rejects changes that improve one subsystem while destabilizing the app.

## Required Startup Context For Every Aria Sub-Agent

Before meaningful work:

- `PROJECT_MEMORY_LEDGER.md`
- `tools/girlai2/docs/COMPONENT_INVENTORY.md`
- `tools/girlai2/docs/SERVICE_INTERACTIONS.md`
- `tools/girlai2/docs/WORKFLOW_COMPLIANCE.md`
- `tools/girlai2/docs/ARIA_ANIMATION_CAPABILITY_MATRIX.md` when animation or Live2D behavior is involved

Project routing reference:

- `.cursor/rules/subagent-mcp-routing.mdc`

## Aria Sub-Agent Charters

### 1. Lead Integrator

Role:

- Owns final architecture coherence
- Owns final merge decisions
- Owns priority order
- Owns cross-subsystem tradeoffs
- Owns project memory quality

Must decide:

- what ships now
- what gets deferred
- whether a specialist result is good enough
- whether a fix creates hidden regressions

Primary write scope:

- `PROJECT_MEMORY_LEDGER.md`
- `tools/girlai2/docs/*` planning / status docs
- any integration glue that crosses subsystem boundaries

Must not do by default:

- large isolated subsystem rewrites that belong to a specialist if a specialist is available

### 2. Latency Agent

Role:

- Improve response speed and reduce perceived lag
- Own p50 / p95 measurement and regression tracking
- Reduce backend and playback critical path time

Primary goals:

- text response latency
- voice start latency
- reduce unnecessary provider calls
- reduce avoidable Firestore round trips
- make expensive quality passes selective instead of always-on

Primary write scope:

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/voiceService.ts`
- `tools/girlai2/functions/src/index.ts`
- `tools/girlai2/docs/*latency*`
- `tools/girlai2/docs/*benchmark*`

Must not own:

- avatar motion choreography
- screen layout polish unless it directly affects perceived response time

### 3. Feature Reliability Agent

Role:

- Ensure visible product features are complete, stable, and ready for testing
- Own regression hunting and readiness verification

Primary goals:

- Live Mode works
- Date Mode works and restores correctly
- relationship screen works
- chat resume behavior is correct
- message replay bugs stay fixed
- top-bar features and settings flows are stable

Primary write scope:

- `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
- `tools/girlai2/lib/features/chat/widgets/*.dart`
- `tools/girlai2/lib/features/camera/screens/camera_vision_screen.dart`
- `tools/girlai2/lib/features/camera/services/*.dart`
- `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
- `tools/girlai2/lib/core/services/firebase_service.dart`
- related callable endpoints in `tools/girlai2/functions/src/index.ts`
- test scripts and QA docs for device flows

Must not own:

- deep personality tuning
- advanced animation design beyond bug fixes

### 4. Personality Agent

Role:

- Own Aria’s conversational quality and behavioral consistency

Primary goals:

- self-awareness and truthful capability explanations
- pacing, consent, repair, question budget
- memory continuity and follow-up quality
- engaging but non-pushy conversation
- feature explanation in plain language

Primary write scope:

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/goldenEvalService.ts`
- personality and quality docs under `tools/girlai2/docs/`

Must not own:

- runtime Live2D behavior
- camera/live-mode transport logic

### 5. Avatar Motion Agent

Role:

- Own Aria’s runtime motion behavior and future motion-authoring pipeline

Primary goals:

- speaking motion quality
- idle life
- expression transitions
- overlays and reaction symbols
- screen-space choreography
- future Remotion-assisted authoring workflow

Primary write scope:

- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
- `tools/girlai2/lib/features/avatar/live2d/live2d_bridge.dart`
- `tools/girlai2/lib/features/avatar/motion/*.dart`
- `tools/girlai2/lib/features/avatar/room/*.dart`
- `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`
- Live2D motion planning docs

Must not own:

- backend personality logic
- chat business logic unless needed for motion integration

## Recommended MCP / Tool Defaults By Agent

Aligned with `.cursor/rules/subagent-mcp-routing.mdc`.

### Lead Integrator

- `serena`
- `context7`
- `firebase`

### Latency Agent

- `firebase`
- `dart-mcp`
- `mcp_flutter`
- `context7`

### Feature Reliability Agent

- `firebase`
- `dart-mcp`
- `mcp_flutter`
- `playwright`
- `chrome-devtools`
- `mcp-mobile-server` for Android-specific troubleshooting

### Personality Agent

- `context7`
- `firebase`
- `serena`

### Avatar Motion Agent

- `serena`
- `context7`
- `dart-mcp`
- `mcp_flutter`

## File Ownership Summary

### Lead Integrator

- `PROJECT_MEMORY_LEDGER.md`
- `tools/girlai2/docs/ARIA_SUBAGENT_OPERATING_MODEL.md`
- integration and checkpoint docs

### Latency Agent

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/voiceService.ts`
- `tools/girlai2/functions/src/index.ts`

### Feature Reliability Agent

- `tools/girlai2/lib/features/chat/screens/chat_screen.dart`
- `tools/girlai2/lib/features/chat/widgets/*.dart`
- `tools/girlai2/lib/features/camera/screens/camera_vision_screen.dart`
- `tools/girlai2/lib/features/camera/services/*.dart`
- `tools/girlai2/lib/features/relationship/screens/relationship_screen.dart`
- `tools/girlai2/lib/core/services/firebase_service.dart`
- feature-facing function entrypoints in `tools/girlai2/functions/src/index.ts`

### Personality Agent

- `tools/girlai2/functions/src/services/llmService.ts`
- `tools/girlai2/functions/src/services/personalityService.ts`
- `tools/girlai2/functions/src/services/memoryService.ts`
- `tools/girlai2/functions/src/services/goldenEvalService.ts`

### Avatar Motion Agent

- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
- `tools/girlai2/lib/features/avatar/live2d/live2d_bridge.dart`
- `tools/girlai2/lib/features/avatar/motion/*.dart`
- `tools/girlai2/lib/features/avatar/room/*.dart`
- `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`

## Conflict Rules

1. `llmService.ts` is shared only between Latency Agent and Personality Agent.
2. When both need it, sequence work:
   - personality logic first if behavioral contract changes
   - latency optimization second if it preserves the contract
3. `index.ts` is shared only between Latency Agent and Feature Reliability Agent.
4. `chat_screen.dart` is owned by Feature Reliability Agent unless the change is purely avatar motion presentation, in which case the Avatar Motion Agent may edit with explicit handoff.
5. No agent should edit docs outside its scope unless the Lead Integrator requests it.

## First Parallel Work Package

Priority: responsiveness first, then feature readiness for testing.

### Package A: Latency Baseline and Fast Wins

Owner: Latency Agent

Goals:

- establish current response-time baseline
- identify biggest latency contributors
- apply highest-yield fast wins without changing visible product behavior

Tasks:

1. Instrument `generateResponse` and `generateVoiceMessage` with stage timings if any gaps remain.
2. Produce current p50 / p90 / p95 snapshot for:
   - text response
   - voice generation
   - time-to-audible playback
3. Identify top 5 slowest stages.
4. Apply first-wave improvements:
   - skip non-critical work on fast turns
   - reduce redundant Firestore reads
   - tighten model escalation conditions
   - reduce avoidable voice startup delay
5. Re-run benchmark and report deltas.

Success criteria:

- measurable reduction in median response time
- no quality regression in core chat behavior

### Package B: Feature Readiness Sweep

Owner: Feature Reliability Agent

Goals:

- ensure major visible features work and are ready for testing

Tasks:

1. Verify and fix:
   - Live Mode launch and return
   - Date Mode start, persist, resume, end
   - relationship screen crash
   - chat return does not replay old assistant line
   - reaction overlay remains visible when emotional state should show it
2. Build a feature readiness checklist for the main chat flow.
3. Run a focused device regression pass.
4. Produce a pass/fail matrix.

Success criteria:

- no known crashers on visible core features
- main chat surface is ready for structured testing

### Package C: Personality Test-Readiness Support

Owner: Personality Agent

Goals:

- make Aria test-ready as a product, not just technically functional

Tasks:

1. Verify self-awareness and capability explanation responses.
2. Verify that key feature explanations reflect current product truth.
3. Prepare a concise prompt pack for testing:
   - capability questions
   - follow-up memory checks
   - warmth and engagement checks
   - repair and consent checks
4. Flag any behavior that should block broad testing.

Success criteria:

- tester can intentionally probe features and get truthful answers
- no major mismatch between product reality and Aria’s self-description

## Merge Order For This Package

1. Package B critical crash and regression fixes
2. Package A latency improvements
3. Package C test-readiness refinement
4. Integrator pass across all three

Reason:

- broken visible features invalidate latency and personality testing
- latency should improve once feature stability is restored
- personality readiness should reflect the actual current feature set

## What We Defer Until After This Package

- major animation upgrade
- Remotion-assisted motion authoring
- new expression families
- deeper visual polish beyond test-readiness

Reason:

- those are high-value, but they should land on a stable, testable product base

