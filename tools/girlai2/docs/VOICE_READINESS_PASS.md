# Voice Readiness Pass

Date: 2026-04-08
Scope: `tools/girlai2`

## Goal

Make voiced replies feel like the same Aria often enough for structured tester use.

## Changes In This Pass

- Shortened Azure regular-tier provider fallback cooldown from `180s` to `45s` so a single Azure throttle does not force a long identity shift.
- Tuned ElevenLabs regular-tier fallback settings to stay closer to Azure's warmer, steadier persona voice.
- Added stronger TTS text cleanup for:
  - ampersands
  - slash-separated phrases
  - em/en dashes
  - repeated punctuation
  - conversational fillers like `mm-hmm` and `uh-huh`
- Kept deterministic spoken-date normalization as part of the voice path.
- Added diagnostics fields for:
  - `fallbackReason`
  - `continuityMode`

## Tester-Ready Bar

Voice is considered tester-ready when:

- no obvious date/ordinal speech bug appears
- normal short and medium replies sound like the same character
- Azure fallback does not create a long multi-minute voice identity break
- fallback turns still feel recognizably like Aria even if the provider changes

## Current State

- Backend voice reliability changes are implemented.
- Local backend verification is complete.
- Live device verification is still pending because no ADB device was attached during this pass.

## Required Live Checks

Use these prompts in order:

1. `Say this back naturally: April 3rd, 2026.`
2. `Okay!! I can do that — dinner is 4/10/2026 & the weather matters too.`
3. `That sounds really sweet.`
4. `I am a little overwhelmed today, but I am still here.`

Watch for:

- natural date speech
- no spoken punctuation weirdness
- no obvious identity swap across consecutive voiced turns
- acceptable startup and playback continuity

## Evidence To Capture

- one short-turn voice screenshot/log set
- one medium-turn voice screenshot/log set
- one fallback-triggered voice screenshot/log set if provider pressure occurs
