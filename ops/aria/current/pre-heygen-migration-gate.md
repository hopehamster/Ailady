# Pre-HeyGen Migration Gate

Date: 2026-04-05
Scope: `tools/girlai2`

This document is the canonical readiness gate before serious migration work begins on the `HeyGen WebView` avatar path.

## Status Tags

- `live`: working now
- `partial`: exists but still inconsistent, incomplete, or under-validated
- `planned`: accepted direction, not yet built
- `deferred`: intentionally not current priority

## Gate Rule

Before meaningful HeyGen migration implementation begins, the items in **Hard Pre-Migration Gate** should be at `live` or explicitly and deliberately disabled from the user-facing surface.

The point is simple:

- do not move core product defects into a new avatar shell
- do not let avatar modernization outrun conversation, memory, voice, and mode reliability

## Hard Pre-Migration Gate

### 1. Core Product Stability

- Auth/login/onboarding flow: `live`
- Chat send/receive flow: `live`
- Resume/background/app-switch stability: `partial`
- No duplicate replay-on-return: `partial`
- Settings open/save reliability: `live`
- Relationship screen basic path: `partial`
- Date Mode basic path: `live`
- Live Mode basic path: `partial`

### 2. Responsiveness

- Normal text turns on `IN2017` feel acceptable: `live`
- Fast-turn routing is active: `live`
- Prompt compaction and cost-cut passes in this clean repo: `live`
- Dedicated latency benchmark on deployed path: `live`
- Voice startup delay acceptable for testing: `live`

### 3. Truthfulness / Self-Awareness

- `what can you do` deterministic capability reply: `live`
- `what can you not do yet` deterministic limits reply: `live`
- capability comparison in layman terms: `live`
- settings-aware feature explanation breadth: `partial`
- no contradictory self-claims across turns: `partial`

### 4. Memory / Chronology / Repair

- recent-exchange callback chooses the right thread: `live`
- chronology/date handling is structurally correct: `live`
- stale-memory suppression is strong enough: `partial`
- repair mode separates mixed threads cleanly: `live`
- short-reply handling stays low-pressure: `partial`

### 5. Voice Reliability

- voice generation succeeds reliably: `live`
- emoji/symbol speech cleanup: `live`
- fallback chain works: `live`
- voice identity/timbre consistency: `partial`
- date phrasing and spoken naturalness: `partial`

### 6. Observability / Repeatable Validation

- repeatable Android regression harness exists: `live`
- semantic sweep artifacts exist for `70578ba3`: `live`
- latency pass is formalized and repeatable: `live`
- current-state docs are up to date: `live`

## Full Aria Feature And Cognition Inventory

### Product Shell

- Phone auth: `live`
- OTP verification: `live`
- Onboarding/profile naming: `live`
- Settings/preferences: `live`
- Chat screen and message flow: `live`
- Transcript toggle: `live`
- Relationship / bond screen: `partial`
- Memory screen: `live`
- Date Mode: `live`
- Live Mode / camera vision: `partial`
- Proactive/internal tester surfaces: `partial`

### Conversation Engine

- Core response generation: `live`
- Fast-turn model route: `live`
- deterministic capability intent routing: `live`
- deterministic capability limits routing: `live`
- repair mode: `live`
- question-budget control: `partial`
- consent-aware depth handling: `partial`
- topic choreography: `partial`
- repetition suppression: `partial`
- warm/captivating response shaping: `partial`

### Memory And Cognition

- short-term conversation context: `live`
- recent-exchange callback: `live`
- chronology / date memory: `live`
- open-loop behavior: `partial`
- layered memory behavior: `partial`
- semantic recall: `live`
- memory-cost gating: `partial`
- truth kernel / runtime self-model: `live`
- settings-aware self-awareness: `partial`
- relationship continuity composer: `partial`
- weekly tuning summary path: `partial`
- shadow evaluator / benchmark path: `partial`

### Self-Awareness

- explain current features in plain English: `live`
- explain current limits in plain English: `live`
- compare herself against simpler companion apps: `live`
- generate guided demo prompts: `live`
- truthful unknown-state handling: `live`
- broader feature awareness coverage: `partial`

### Voice

- TTS generation: `live`
- Azure voice path: `live`
- ElevenLabs fallback path: `live`
- voice startup optimization: `partial`
- voice naturalness tuning: `partial`
- spoken cleanup for emoji/symbols: `live`
- fallback voice consistency: `partial`

### Avatar / Visual Layer

- current avatar rendering: `live`
- blink / gaze / breath / sway: `live`
- screen-space movement: `live`
- thought-bubble overlay: `live`
- relationship/date/live UI affordances: `live`
- richer authored motion clips: `deferred`
- fuller arm/body choreography: `partial`
- `HeyGen WebView` migration path: `planned`

### Advanced Cognitive Additions

- stronger chronology layer: `partial`
- open-loop lifecycle policy: `partial`
- repair naturalness metrics: `planned`
- managed-tone / canned-tail metrics: `planned`
- richer realization library: `planned`
- deeper social-intelligence modules: `planned`
- broader self-description coverage: `planned`

## What Does Not Need To Block HeyGen

These do not need to be perfect before migration:

- current Live2D visual polish
- richer authored motion clips
- final fuller animation choreography

Reason:

- those are the areas most likely to be superseded by the new avatar layer

## What Must Be Solid Before HeyGen

These do need to be solid enough:

1. chat stability
2. core mode stability
3. capability truthfulness
4. chronology / repair / recent-exchange reliability
5. acceptable text responsiveness
6. reliable enough voice path for testing
7. repeatable regression workflow

## Current Recommendation

Continue with this order:

1. finish responsiveness hardening
2. finish feature-readiness hardening
3. use this document as the migration gate
4. then begin serious `HeyGen WebView` implementation work
