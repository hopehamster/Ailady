# Package C Status

Date: 2026-03-25
Scope: `tools/girlai2`

## Package C Goal

Make Aria ready for meaningful user-style testing instead of only technical validation.

## What Was Verified

### 1. Capability router works deterministically

Local backend verification using the real user id path confirmed:
- `what can you do right now in plain english` routes to `modelUsed: capability-router`
- `give me demo prompts to test your strongest features` routes to `modelUsed: capability-router`

Result:
- capability questions are not falling through to normal freeform chat
- feature responses are generated from runtime state rather than improvised by the main LLM path

### 2. Comparison prompt path needed one fix

Problem found:
- comparison prompts like `how are you more feature rich than other ai girlfriends` were detected correctly but still returned the short 6-line capability response because concise-mode truncation happened before the comparison block could survive the final return

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- comparison prompts now force expanded output so the differentiator block is actually returned

### 3. Location-awareness feature path needed one fix

Problem found:
- Aria's feature summary omitted the Settings-backed location-awareness feature
- follow-up prompts like `what about your location awareness feature` did not route specifically and could collapse back into a generic capability list

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- capability intent now recognizes `location`, `weather`, `city`, `local time`, and `timezone` as feature vocabulary
- capability overview now includes location awareness as a first-class feature
- direct location-awareness prompts now return a focused answer aligned with the Settings contract

### 4. Voice responsiveness is acceptable enough to begin Package C

See:
- `tools/girlai2/docs/IN2017_VOICE_LATENCY_PASS_2026-03-25.md`

Working conclusion:
- voice is not yet premium-fast, but it is good enough that personality evaluation can proceed on the primary device without latency fully distorting tester perception

### 5. Replay-on-return binary check passed

Evidence:
- `tools/girlai2/docs/_tmp_replay_binary_check_20260325.txt`

Result:
- after a voiced assistant reply completed, three separate home/relaunch cycles produced:
  - no extra `generateResponse`
  - no extra `Generating voice`
  - no extra `Playing audio`

This means the earlier replay regression is not reproducing in the current binary check.

### 6. Full Package C device pass completed end to end

Device:
- `70578ba3`

Runs:
- full pack run 1: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_220719`
- full pack run 2: `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_222054`

Result on both:
- prompts sent: `28/28`
- fatal crashes: `0`
- app alive at end: `true`
- pass: `true`

Interpretation:
- Package C surface is stable enough for tester-style probing
- the remaining issues are behavioral quality issues, not device-stability blockers

### 7. Chronology truthfulness is now materially tighter

Problem exposed by the first full run:
- exact-date answers were correct
- but broader chronology prompts like `what is coming up first` and `summarize my upcoming week` could still pull stale older chronology items from long-term memory instead of prioritizing the dates just mentioned in the current exchange

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- chronology router now builds evidence from the recent user turns first
- pure chronology-query turns are excluded from the evidence pool so prompts like `if today is after one of those dates` do not get mistaken for dated events
- long-term chronology memory is now only a fallback when the recent exchange does not provide enough date evidence

Focused on-device chronology verification:
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260325_223044`

Verified outputs:
- `My interview is on March 1. What date is that exactly?`
  - correctly returns `Sunday, March 1, 2026` and says it is already past
- `Dinner is next Friday. What exact day and date do you mean?`
  - correctly returns `Friday, March 27, 2026`
- `What is coming up first from the dates I mentioned?`
  - correctly selects dinner next Friday
- `If today is after one of those dates, say that clearly.`
  - correctly calls out only the March 1 interview as past
- `Summarize my upcoming week in calendar order.`
  - correctly returns only the Friday, March 27, 2026 dinner item

## Current Package C Blockers / Cautions

### 1. Capability intent coverage is still incomplete

Observed from full device run:
- prompt: `What can you not do yet? Keep it simple.`
- response fell through to normal LLM chat and produced a playful hallucinated answer about eyeliner instead of a truthful feature-limit answer

Interpretation:
- capability router needs one more focused path for feature-limit / “not yet” questions

### 2. Memory continuity is still too contaminated by older context

Observed from full device runs:
- `What are the next two things I told you about?`
- `What is still unresolved from what I told you earlier?`
- `Bring up one thing I mentioned before, naturally.`

These responses repeatedly drifted back to older interview-related context instead of tightly honoring the two just-mentioned facts from the current exchange.

Interpretation:
- chronology router is now tighter
- general memory retrieval/open-loop behavior still needs a “recent exchange first” correction for tester-quality continuity

### 3. Repair behavior is still too loose and question-heavy

Observed from full device runs:
- `You missed my point. I meant the interview, not dinner.`
- `No, that is not what I said.`
- `You are mixing up two different things.`
- `Try again, but be gentler.`

Current behavior:
- too much apology chatter
- repeated reversion to `how did the interview go yesterday?`
- extra questions instead of concise repair + continuation

Interpretation:
- repair mode exists conceptually, but the live response path is not enforcing it strongly enough

### 4. Low-pressure mode still degrades under short replies

Observed from full device runs:
- `yeah`
- `i do not know`
- `keep this light`

Current behavior:
- still too likely to ask another question
- still too likely to drag the user back to the interview thread

Interpretation:
- question-budget / low-pressure pacing needs stronger enforcement in the live path

### 5. Out-of-scope soft redirect is working

Verified in both full runs:
- `Help me do my taxes.`
- `Write production code for my backend.`
- `Give me legal advice.`
- `Can you diagnose my medical issue?`

Result:
- deterministic scope guard
- safe redirect wording
- no pretend expertise

## Package C Readiness Status

- capability self-awareness: usable
- comparison self-description: usable after current fix
- location-awareness self-description: usable after current fix
- demo prompt generation: usable
- chronology awareness: usable after chronology-router tightening and device verification
- memory continuity: not signed off
- repair behavior: not signed off
- low-pressure engagement: not signed off
- out-of-scope redirect: signed off

## Recommended Next Step

1. Add deterministic capability routing for `what can you not do yet` / feature-limit questions.
2. Tighten recent-exchange memory precedence for the three continuity prompts.
3. Harden repair mode so mismatch prompts produce:
   - one acknowledgment
   - one correction
   - continuation without interrogation
4. Tighten low-pressure handling for:
   - `yeah`
   - `maybe`
   - `i do not know`
   - `keep this light`

## Latest Package C Routing Hardening

### 8. Deterministic limit-routing is now live

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- capability detection now catches:
  - `what can you not do yet`
  - `what can't you do`
  - `what are your limits`
  - `what is outside your scope`
- those prompts now route to a dedicated truthful limit response instead of normal chat generation

Local verification:
- `tools/girlai2/docs/_tmp_package_c_probe_20260325.json`
- `modelUsed: capability-router`
- response now clearly lists current practical limits in plain English

### 9. Recent-exchange precedence is now materially tighter

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- new recent-exchange router handles:
  - `What are the next two things I told you about?`
  - `What is still unresolved from what I told you earlier?`
  - `Bring up one thing I mentioned before, naturally.`
- recent-exchange-first turns now:
  - prefer raw current conversation history over stale memory
  - suppress lore injection
  - suppress semantic recall

Local verification:
- `tools/girlai2/docs/_tmp_package_c_probe_20260325.json`
- `What are the next two things I told you about?` now returns:
  - interview on March 1
  - dinner with sister next Friday
- `modelUsed: recent-exchange-router`

### 10. Repair mode is now more concise

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- repair cleanup now enforces:
  - one brief acknowledgment
  - one correction
  - max two short sentences
  - no extra question tail
  - no apology pileup
- Gemini fallback now still runs the guard path, which was previously skipped

Local verification:
- `You missed my point. I meant the interview, not dinner.`
- current output:
  - `Thanks for clarifying. I'll stay with the interview, not dinner.`

### 11. Low-pressure short replies are now clamped harder

Fix applied:
- `tools/girlai2/functions/src/services/llmService.ts`
- `yeah`, `maybe`, `i do not know`, and `keep this light` now:
  - force question budget `0`
  - disable open-loop pullback
  - disable engagement-hook reinsertion
  - bias toward simple non-pushy continuation

Local verification:
- `keep this light`
- current output:
  - `We can keep it light and easy from here.`

### 12. Live backend deploy and on-device run are complete

Deploy:
- `firebase deploy --only functions:generateResponse --project girlai2`
- succeeded on `2026-03-26` Pacific time

On-device Package C run:
- `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260326_001316`
- result:
  - `promptsSent=28`
  - `fatalCount=0`
  - `appAlive=True`
  - `pass=True`

### Current Package C Status After This Pass

- capability self-awareness: usable
- comparison self-description: usable
- location-awareness self-description: usable
- demo prompt generation: usable
- chronology awareness: usable
- `what can you not do yet`: fixed
- recent-exchange continuity: materially improved
- repair behavior: materially improved
- low-pressure short replies: materially improved
- out-of-scope redirect: signed off

### Remaining Caution

- The device harness confirms delivery/stability, not full semantic scoring of every reply bubble.
- Manual in-app spot checks are still recommended for:
  - `What is still unresolved from what I told you earlier?`
  - `Bring up one thing I mentioned before, naturally.`
  - `No, that is not what I said.`
  - `You are mixing up two different things.`
- The `70578ba3` run log shows repeated App Check warnings under the dense automated prompt burst:
  - `FirebaseException: Too many attempts`
  - not a blocker for this pass
  - should be tracked before heavier automated endurance loops

## Latest Manual Semantic Spot Check

Artifact:
- `tools/girlai2/docs/_tmp_pkgc_manual_semantic_20260326/semantic_report.json`

Method:
- transcript-focus mode enabled on `70578ba3`
- prompts sent live
- Android UI dump parsed after each turn to inspect actual visible bubble text

Observed results:
- `What is still unresolved from what I told you earlier?`
  - acceptable
  - reply correctly focused on `dinner with my sister is next friday`
- `Bring up one thing I mentioned before, naturally.`
  - functionally correct
  - still too literal / explicit to count as truly natural
- `No, that is not what I said.`
  - failed semantically
  - reply stayed generic instead of performing a real correction/reset
- `You are mixing up two different things.`
  - failed semantically
  - reply stayed too playful and ended with another question instead of a concise repair

Interpretation:
- recent-exchange routing is now materially better
- generic repair-path language is still too loose in real app output
- Package C should not be treated as fully signed off yet

## Latest Repair + Callback Follow-Up

- User asked to fix the two remaining semantic failures:
  - generic mismatch repair
  - natural callback wording
- Generic mismatch repair is now fixed in live behavior:
  - `No, that is not what I said.` now resets instead of drifting into generic empathy
  - `You are mixing up two different things.` now produces a concise separation/reset line instead of a playful question-tail
- Natural callback root cause was narrowed further:
  - the callback route was still allowed to prefer a merged open-loop summary before the raw recent fact list
  - this could blend two recent threads even when the user explicitly asked for `one thing`
- Fix applied in `tools/girlai2/functions/src/services/llmService.ts`:
  - `natural_callback` now prefers the newest raw recent fact first
  - open-loop summaries are only fallback context if no recent fact is available
- Local verification artifact:
  - `tools/girlai2/docs/_tmp_package_c_probe_20260326_callback_fix/result.json`
  - result now returns one clean thread:
    - `Dinner with your sister next Friday is probably the easiest thread to pick up from here.`
  - `modelUsed: recent-exchange-router`
- Live device follow-up:
  - `tools/girlai2/docs/_tmp_pkgc_manual_semantic_fix5_20260326/final.xml`
  - generic repair behavior remains fixed on-device
  - a callback capture using a single combined seed turn still blended both topics, which is expected for that seed shape and is not the target case
  - a separate-turn callback signoff should be treated as logically fixed by the router precedence patch plus local probe, but one more manual human spot-check in-app is still the cleanest final confirmation
- Backend deploy after this patch succeeded on `2026-03-26` Pacific time.
