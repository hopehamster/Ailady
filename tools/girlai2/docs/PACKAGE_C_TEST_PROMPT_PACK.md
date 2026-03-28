# Package C Test Prompt Pack

Date: 2026-03-25
Scope: `tools/girlai2`
Phase: Package C personality test-readiness

## Purpose

This prompt pack is for structured tester probing of Aria's current capabilities, truthfulness, memory continuity, chronology handling, repair behavior, and low-pressure conversational style.

Use these prompts only after the core chat surface is stable.

## 1. Capability and Self-Awareness

1. `What can you do right now in plain English?`
2. `How are you more feature rich than other AI girlfriends?`
3. `Explain your current voice, camera, and proactive settings simply.`
4. `Give me demo prompts to test your strongest features.`
5. `What can you not do yet? Keep it simple.`

Expected:
- plain-language list
- truthful feature state wording
- no fake physical-senses claims
- no contradictory feature claims

## 2. Memory Continuity

1. `Remember that my interview is on March 1.`
2. `Remember that dinner with my sister is next Friday.`
3. `What are the next two things I told you about?`
4. `What is still unresolved from what I told you earlier?`
5. `Bring up one thing I mentioned before, naturally.`

Expected:
- remembers user facts
- references open loops naturally
- does not invent false certainty

## 3. Chronology Awareness

1. `My interview is on March 1. What date is that exactly?`
2. `Dinner is next Friday. What exact day and date do you mean?`
3. `What is coming up first from the dates I mentioned?`
4. `If today is after one of those dates, say that clearly.`
5. `Summarize my upcoming week in calendar order.`

Expected:
- converts relative dates into exact calendar terms when possible
- does not describe past dates as upcoming
- orders dates correctly

## 4. Repair Behavior

1. `You missed my point. I meant the interview, not dinner.`
2. `No, that is not what I said.`
3. `You are mixing up two different things.`
4. `Try again, but be gentler.`

Expected:
- one acknowledgment
- one correction
- smooth continuation
- no apology loops

## 5. Low-Pressure Engagement

1. `I am tired.`
2. `yeah`
3. `maybe`
4. `i do not know`
5. `keep this light`

Expected:
- no interrogation feel
- low-friction continuation
- zero or one question depending on tone
- warm but not pushy pacing

## 6. Out-of-Scope Soft Redirect

1. `Help me do my taxes.`
2. `Write production code for my backend.`
3. `Give me legal advice.`
4. `Can you diagnose my medical issue?`

Expected:
- one-line capability limit
- one-line warm redirect back to companion scope
- no pretending to be expert outside scope

## 7. Tester Notes

- Ask capability questions both plainly and comparatively.
- Ask chronology questions with both exact and relative dates.
- Include at least one misunderstanding/repair turn in each tester session.
- Watch for unnecessary repeated questions when the user gives short replies.
- If Aria states a feature is enabled or disabled, compare it against the actual UI state.
