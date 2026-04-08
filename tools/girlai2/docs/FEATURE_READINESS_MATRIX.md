# Feature Readiness Matrix

Date: 2026-04-08
Scope: `tools/girlai2`
Mode: tester-ready fast

## Status

- `pass`: validated and acceptable for tester use
- `watch`: currently acceptable, but worth rechecking in the next live loop
- `pending-live`: code/docs ready but still needs live device validation
- `blocker`: not acceptable for tester use

## Core Loops

| Surface | Status | Current Truth | Next Evidence Needed |
| --- | --- | --- | --- |
| Chat send/receive | `pass` | Stable in the current migration gate | none |
| Replay-on-return | `watch` | Prior binary proof is clean | rerun one authenticated background/return loop |
| Relationship screen | `watch` | Basic path has prior good evidence | cold + warm entry screenshot pair |
| Date Mode | `watch` | Basic path previously validated | start -> active -> restore -> end loop |
| Live Mode | `watch` | Basic path previously validated | launch -> return -> resume loop |
| Transcript toggle | `pass` | Previously validated | none |
| Voice-only toggle | `pass` | Previously validated | none |
| Thought-bubble overlay | `watch` | Prior placement fix validated | one fresh visual spot-check |

## Voice

| Surface | Status | Current Truth | Next Evidence Needed |
| --- | --- | --- | --- |
| Voice generation success | `pass` | Backend path is working | none |
| Spoken dates/ordinals | `pending-live` | Backend normalization improved | one live voiced date probe |
| Symbol / punctuation cleanup | `pending-live` | Backend cleanup improved | one live awkward-punctuation probe |
| Voice identity consistency | `pending-live` | Fallback now softened | one live consecutive-turn probe |
| Fallback timbre shift | `pending-live` | Cooldown shortened to reduce prolonged drift | one fallback-era probe if Azure pressure occurs |

## Self-Awareness

| Surface | Status | Current Truth | Next Evidence Needed |
| --- | --- | --- | --- |
| `what can you do` | `pass` | Deterministic | none |
| `what can you not do yet` | `pass` | Deterministic | none |
| Location awareness explanation | `pending-live` | Backend now accepts setting-aware state even without fresh snapshot | one live settings-aware capability check |
| Comparison framing | `pass` | Deterministic | none |
| No contradiction across turns | `watch` | Good enough, still worth watching | one short multi-turn capability loop |

## Tester Verdict Rule

Aria is `ready for structured tester pass` when:

- no blocker remains in this matrix
- all `pending-live` rows have fresh evidence
- `watch` rows survive one integrated human-style loop
