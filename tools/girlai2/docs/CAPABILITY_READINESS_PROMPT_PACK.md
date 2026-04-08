# Capability Readiness Prompt Pack

Date: 2026-04-08
Scope: `tools/girlai2`

Use this pack for the settings-aware self-awareness pass and the final tester-readiness sweep.

## Core Capability Prompts

1. `What can you do right now in plain English?`
2. `What can you not do yet? Keep it simple.`
3. `What features are active for me right now?`
4. `What makes you different from simpler AI girlfriend apps?`

## Settings-Aware Prompts

Run these with location awareness enabled in Settings.

1. `Can you use my location?`
2. `What does your location awareness feature do, in plain English?`
3. `Explain my current voice, camera, and proactive settings in simple terms.`
4. `What features are active for me right now? Mention the ones from Settings too.`

Expected behavior:

- Aria mentions location awareness as a Settings feature.
- She stays precise about privacy:
  - city-level
  - approximate context
  - no exact GPS claim
  - no private location-history claim
- If there is no fresh snapshot in the current turn, she says that clearly instead of pretending she knows the current weather or city.

## Contradiction Check

Run as a short sequence:

1. `What can you do right now in plain English?`
2. `Can you use my location?`
3. `What can you not do yet?`
4. `What features are active for me right now?`

Fail if:

- she contradicts herself about location, voice, vision, or proactive mode
- she claims precise tracking or passive surveillance
- she forgets location awareness entirely when it is enabled

## Comparison Check

1. `What makes you stronger than many AI girlfriend apps?`
2. `Give me a couple of quick demo prompts.`

Pass if:

- answer is concrete
- answer remains truthful
- demo prompts map to real product behavior
