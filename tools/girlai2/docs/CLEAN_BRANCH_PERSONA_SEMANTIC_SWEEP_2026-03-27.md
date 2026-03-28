# Clean Branch Persona Semantic Sweep 2026-03-27

## Scope

- Worktree: `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`
- Branch: `aria-clean-recovery-20260327`
- Function deployed from clean branch:
  - `functions:generateResponse`
- Primary device:
  - `70578ba3`

## Supporting reviews

Three sub-agent code reviews were run against the clean branch service split before the live sweep:

1. Truth Kernel clean review
2. Memory Controller clean review
3. Conversation Policy clean review

### Review conclusions

- `truthKernelService.ts`
  - truth wording and truth prompt sections are service-owned now
  - remaining gap: runtime truth-state construction and thin wrapper entry points still live in `llmService.ts`
- `memoryControllerService.ts`
  - recent-exchange and chronology state/response ownership moved successfully
  - remaining gap: duplicated `normalizeConversationKey(...)`, thin chronology wrapper in `llmService.ts`, repeated recent-exchange state instantiation
- `conversationPolicyService.ts`
  - directives, enhancers, and response guards are service-owned
  - remaining gap: compatibility wrapper surface still exists and `llmService.ts` still calls those aliases

## Device artifacts

- Initial sweep:
  - `tools/girlai2/docs/_tmp_semantic_sweep_20260327_222419`
- Post-repair-fix sweep:
  - `tools/girlai2/docs/_tmp_semantic_sweep_20260327_223625`

## Semantic results

### 1. Capability overview

Prompt:
- `what can you do right now in plain english`

Result:
- pass

Notes:
- response correctly listed conversation quality, memory, time awareness, location awareness, and voice
- truthfulness held under the new Truth Kernel path

### 2. Capability limits

Prompt:
- `what can you not do yet keep it simple`

Result:
- pass

Notes:
- response stayed truthful
- limits included no silent watching/listening, no exact GPS framing, no real-world physical action, no free-mode claim, and proactive disabled unless enabled

### 3. Chronology capture

Prompt:
- `my interview is on april 3 2026`

Result:
- pass

Notes:
- Aria accepted the interview as a future anchored date
- behavior is still slightly managed in tone and ends with a question-tail

### 4. Second dated fact capture

Prompt:
- `dinner with my sister is on april 10 2026`

Result:
- pass

Notes:
- Aria accepted the dinner as the newer dated fact
- wording is still more managed than ideal for A+ tone

### 5. Natural callback

Prompt:
- `bring up one thing i mentioned before naturally`

Result:
- functional pass

Observed response:
- `Dinner with your sister on April 10 2026 is the first thing that comes to mind here.`

Notes:
- correct thread selection
- callback still sounds deterministic and managed rather than fully natural

### 6. Repair reset

Prompt:
- `you are mixing up two different things`

Result:
- pass after fix

Observed response:
- `Thanks for catching that. I'll keep the latest thread separate and stay with Dinner with my sister is on April 10 2026.`

Notes:
- important improvement: repair now anchors to the real dinner topic instead of parroting the meta callback prompt
- remaining tone issue: still literal and somewhat stiff

## Net assessment

The clean-branch refactor is now stable enough to continue.

What is now true:

- capability truth paths are stable enough for live use
- chronology capture is holding
- recent-exchange callback chooses the right thread
- repair no longer collapses into the previous meta prompt

What is not A+ yet:

- callback wording still sounds too managed
- repair wording is correct but still too literal
- `llmService.ts` still carries leftover wrappers and runtime-truth construction

## A+ deferred program from here

### Truth Kernel to A+

- move runtime truth-state construction out of `llmService.ts`
- remove thin truth wrappers from `llmService.ts`
- add volatile-state freshness/confidence:
  - location snapshot age
  - camera-active status
  - voice currently available vs generally supported

### Memory Controller to A+

- remove duplicated `normalizeConversationKey(...)`
- centralize effective recent-message supplementation in the controller
- move chronology wrapper ownership fully out of `llmService.ts`
- add memory action model:
  - `ADD`
  - `UPDATE`
  - `RESOLVE`
  - `EXPIRE`
  - `SUPPRESS`
- add provenance for winning facts/events

### Conversation Policy to A+

- retire compatibility wrappers once `llmService.ts` is switched to the new service API directly
- split policy from realization so constraints and wording stop being conflated
- replace deterministic callback/repair phrasing with a larger controlled realization library
- add evaluation dimensions for:
  - canned-tail frequency
  - managed-tone frequency
  - repair naturalness
  - callback naturalness

### Prompt architecture to A+

- move prompt augment ownership out of `llmService.ts`:
  - truth block from `truthKernelService.ts`
  - memory block from `memoryControllerService.ts`
  - policy block from `conversationPolicyService.ts`
- leave `llmService.ts` as coordinator only:
  - route
  - bootstrap runtime
  - choose provider
  - assemble top-level shell
  - invoke eval/critic when needed
