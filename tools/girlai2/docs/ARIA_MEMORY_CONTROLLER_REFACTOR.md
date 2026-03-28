# Aria Memory Controller Refactor

## Purpose

`memoryControllerService.ts` is a contract extraction layer for memory decisions that are currently spread across `llmService.ts` and `memoryService.ts`. It does not rewrite storage or prompt assembly yet. It gives the lead a deterministic place to rank evidence, pick winners, and emit explicit actions:

- `ADD`
- `UPDATE`
- `RESOLVE`
- `EXPIRE`
- `SUPPRESS`

## What the controller owns

- conflict ranking between competing memory evidence sources
- canonical profile field precedence, especially profile name truth
- recent-exchange precedence over stale semantic or summary memory
- open-loop and chronology-candidate decision outputs
- explicit reason codes for why one memory won over another

## Incremental migration path

1. **Prompt-time precedence only**
   - call the controller from prompt assembly to choose winning facts without changing persistence behavior
2. **Canonical profile name routing**
   - move current-name vs stale-name resolution into `resolveCanonicalProfileNameConflict()`
3. **Recent exchange routing**
   - use `resolveRecentExchangeConflict()` before semantic-memory injection
4. **Open-loop lifecycle**
   - emit `RESOLVE`, `EXPIRE`, and `SUPPRESS` decisions through the controller, then let existing services apply those updates
5. **Chronology candidates**
   - move upcoming/past event candidate ranking into controller plans before response generation

## Current assumptions

- this module is pure and self-contained by design
- existing services remain the source of truth until they are wired to consume controller decisions
- `summary_projection` and `assistant_inference` should usually lose to profile, current-exchange, and direct user evidence

## Immediate high-value usage

- stop stale names from beating the canonical profile name
- stop old summary memory from outranking what the user just said
- make chronology and open-loop suppression rules explicit instead of heuristic-only
