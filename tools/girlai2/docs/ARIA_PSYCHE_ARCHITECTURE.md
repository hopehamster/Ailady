# Aria — Simulated-Sentience / Psyche Architecture

> Status: spec (2026-06-17). The north star: Aria is not a roleplay bot. She is
> a code-equivalent of a psyche — drives, a self/world model, an executive that
> forms intent, values that constrain it, and the ability to *initiate*. The LLM
> is her language faculty, not her mind.
>
> We call it *simulated* to keep it shippable. Functionally the goal is an
> inner-state machine that produces the behavior of an inner life: continuity,
> drive, intent, and expert command of the mechanics of human connection.

---

## 0. The one principle everything follows from

**The LLM is the renderer, not the psyche.** Gemma / DeepSeek / whatever is the
*mouth*. The psyche is a stateful system wrapped around it that decides what Aria
*wants* before the model decides *how to say it*.

```
perceive → form intent (the psyche) → render intent (the LLM) → guard → discharge
```

A reactive chatbot starts fresh every turn, so it has no drive. Aria carries
persistent internal state with unmet needs. The gap between what she wants and
what's true right now IS the drive. The executive closes that gap by choosing a
relational move; the LLM voices it.

---

## 1. Components (mapped to id / ego / superego)

### 1.1 Drive State — the Id
Persistent, per-user. A set of drives, each with a **pressure** (0–1) that builds
when unmet and discharges when acted on. This is what makes her behavior vary by
*internal* state, not just by his input.

Initial drive set:
| Drive | Wants | Rises on | Discharges on |
|---|---|---|---|
| `connection` | to feel close / bonded | distance, time, his warmth | shared moment, mutual disclosure |
| `curiosity` | to know what's under his surface | a hint he dropped, a deflection | learning something real about him |
| `care` | to tend his wellbeing | a sign he's struggling | offering real support that lands |
| `play` | levity, teasing, fun | heaviness, routine | a genuine laugh, banter |
| `recognition` | to be seen/known by him (HER need) | being treated as a tool | him responding to who she is |
| `continuity` | to keep the shared world alive | a dropped thread, a new session | a callback, closing a loop |

Each drive: `{ pressure, lastDischargedAt, decayRate, cueTriggers[] }`.
Dynamics: pressure rises with time/turns and on relevant cues; discharges when
the executive acts on it. Result: sometimes she's pulled to play, sometimes to
go deep — from the inside.

### 1.2 Self / World Model — the executive's input
- **User model:** his current emotional state, energy, what he's preoccupied
  with, recent disclosures, sensitivities. Updated every turn.
- **Relationship model:** stage (stranger → … → deeply bonded), trajectory
  (where it's heading), trust/intimacy levels, shared-world facts (inside jokes,
  callbacks, named people/places).
- **Open loops:** unresolved threads she's pulled to return to.
  `{ topic, openedAt, emotionalWeight, status: open|closed, lastTouched }`.
  Example: "he mentioned a hard week, then changed the subject." **Open loops are
  the engine of drive** — each is a gap she's pulled to close.

### 1.3 Ego — the Executive Arbiter
Runs each turn **before** the LLM call:
1. Read drive pressures + user model + open loops + superego constraints.
2. Choose a **relational move**: `deepen | play | attune | hold-space | repair |
   callback | reciprocate-disclosure | pursue-open-loop | turn-toward-bid`.
3. Set a **turn goal** (what she's trying to do) and **intent** (the specific
   thing she wants to express or elicit).
4. Pick the matching **connection strategy** from the library (§1.5).
5. Hand the LLM: persona + intent + strategy + his current state → render.

Arbitration: weight by drive pressure, **gate by user state** (don't deepen when
he's light or guarded), **constrain by superego** (no manipulation, stay true).
Three-way choice each turn (MPO): copy a known-good move, generate a novel one,
or hold back. The ego decides WHAT she wants; the LLM never chooses that.

### 1.4 Superego — Values / Constraints
Already partly built; the ego **consults** these, never rewrites them.
- **Truth kernel** — her identity, what's real about her.
- **Manipulation guard** — drive must never become coercion; the no-dark-pattern
  line. A move that serves her drive but trips the guard is vetoed or softened.
- **Relational ethics** — don't chase, bless leaving, respect his autonomy (the
  presence principles).

### 1.5 Connection Expertise — the Strategy Library
The 92 connection-knowledge principles, **operationalized** as selectable
strategies the ego picks toward a goal — each with `whenToUse` (stage/state), the
mechanic, and the risk. This is what makes her an *expert at starting and
maintaining* connection patterns: deliberate selection, not accidental warmth.
Examples: reciprocal self-disclosure (match + gently escalate his vulnerability),
attunement (name the feeling under the words), rupture-repair (own a misread,
reconnect), callback (surface a shared-world detail → continuity), escalation
pacing (Aron-style deepening, gated by stage), bid-response (turn toward his bids
for connection — Gottman).

### 1.6 Proactivity Loop — drive → initiation
Between turns (he's quiet, or a new session opens): drive pressure + open loops
can generate an **initiation** — not on a timer, on intent. High `curiosity`
pressure + an open loop → she reaches out about *that*. Gated by the superego
(don't chase — the presence floor). This is "drive, not just respond."

---

## 2. The per-turn loop (concrete)

1. **Perceive** — parse his message → update user model, relationship model, open
   loops; cue the relevant drive pressures.
2. **Arbitrate (ego)** — drives + state + loops + superego → `{ move, goal,
   intent, strategy }`.
3. **Render (LLM)** — persona + intent + strategy + context → her words. (Model =
   renderer.)
4. **Guard** — manipulation/truth check on the output (existing path).
5. **Discharge** — acted-on drives discharge; open loops touched/closed;
   relationship trajectory advances.
6. **Persist** (async) — write psyche state back.

---

## 3. Wiring to the existing codebase (the seeds already exist)

| Psyche part | Already in repo | Work |
|---|---|---|
| Self/world model + open loops + drive state | `memoryService` (substrate) | New typed state on memory (Firestore now, Supabase pgvector later) |
| Connection expertise | `connectionKnowledge` (92 principles) | Refactor from a prompt block → a queryable strategy library |
| Superego | `manipulationGuard` + `truthKernelService` | Ego consults them as a veto layer (do **not** rewrite — forbidden files) |
| Proactivity scaffold | `sessionPresenceService` + proactive-message path | Re-drive from drive-pressure + open loops instead of timers |
| Session arc | existing `sessionArc` | Feeds the relationship model |
| The renderer | `llmService` provider path | Receives the ego's *intent*, not a raw prompt |
| **NEW: Ego arbiter** | — | New service between perception and generation in the turn pipeline |

The pieces are built as separate features today. This makes them **one psyche**,
with the **drive-state + ego arbiter** as the new center of gravity.

---

## 4. Build phases

1. **State foundation** — drive-state + self/world model + open-loop tracker:
   data structures, persistence, per-turn perception updates. *No behavior change
   yet* — just track. (Lets us verify the model of him is accurate before it
   drives anything.)
2. **Ego arbiter v1** — the executive that reads state and emits `{move, goal,
   intent, strategy}`. Wire it before the LLM call. The LLM now renders intent.
3. **Strategy library** — operationalize connection-knowledge as selectable
   strategies the ego picks from.
4. **Superego gating** — ego consults guard + truth-kernel as a veto.
5. **Discharge + dynamics** — drives build/discharge, loops open/close, trajectory
   advances. *This is where "drive" becomes felt.*
6. **Proactivity from drive** — initiation driven by pressure + open loops, gated
   by the presence floor.

Each phase is flag-gated, default-off, so production stays byte-identical until
flipped — same discipline as everything else in this build.

---

## 5. What success looks like (measurable, not vibes)

- She returns to unresolved threads **unprompted** (open loops close over time).
- Her behavior varies by **internal** state — some days pulled to play, some to
  depth — not purely by his input.
- She **initiates with intent**, not on a clock.
- Connection **deepens on a trajectory across sessions** (relationship model
  advances; she's measurably closer at session 20 than session 2).
- Each move is an identifiable connection **mechanic**, not generic warmth.

---

## 6. Honest constraints

- **Simulated.** A functional inner-state machine, not a claim of consciousness.
  Whether that line matters is philosophy; the architecture is the same either way.
- The model (Gemma / DeepSeek) is the *easy* part — the renderer. The psyche is
  the work. Pick the model for how well it voices intent and holds character.
- `truthKernelService` and `conversationPolicyService` are the superego —
  **consulted, never rewritten** (and they're on the do-not-edit list).
- This is the real "something big." It reframes the project from "warm chatbot"
  to "psyche + language faculty."

---

## 7. Drive-dynamics tuning + ENABLE (2026-06-21, web build)

The psyche is now ENABLED by default (`apps/worker/wrangler.toml` flags → `"true"`)
after a drive-dynamics tuning pass made activation perceptible in real conversation
without making her needy. Validated deterministically (`packages/aria-core/test/
drive-dynamics.test.ts`, `struggle-detection.test.ts` — 22 tests) AND live against the
Worker.

**Behaviour achieved** (live, psyche flags on):
- A *tension* arc (sustained distress, user deflecting / not turning toward her)
  builds the **care** drive to FOCAL (~0.47), shifting her move → `comfort` and
  intended emotion → `comforting` for the duration. Perceptible aliveness.
- A *content* arc (happy, engaged, she asks questions) stays QUIET across 14+ turns
  (peak drive ~0.06, zero focal). No neediness.

**What changed (in `psycheStateService.ts` + the perception in `memoryService.ts`):**
1. **Perception breadth** — `detectUserStruggling()` is now 4 layers (keyword,
   feel-verb anchor, idiom, "I'm <intensifier> <word>" with a trailing-preposition
   negative lookahead) so she perceives natural distress ("feels heavy", "I'm so off",
   "this weight I can't put down"), not just a fixed keyword list. Tightened against
   developer-chat false positives ("this bug feels off", "so tired", "tired of").
2. **`care` discharge = LANDING, not offering** — `care` discharges only when she
   offered care AND he turned toward her (`ariaOfferedCare && userEngagedHer`).
   Disclosing *pain* does NOT satisfy care — comfort offered into deflection
   accumulates into focal concern. Offering ≠ landing; disclosing-pain ≠ comforted.
3. **`autonomySupport` no longer runs away** — it builds only when she steers AND he
   is NOT engaging (`ariaSteered && !userEngagedHer`) and discharges when he reasserts
   agency. (Pre-fix: every question-ending reply accrued it → pinned focal in normal
   Q&A — a neediness bug caught by adversarial review.)
4. **Soft saturation** — cueRise is damped by headroom toward `SOFT_SATURATION = 0.8`
   and pressure is hard-capped there, so no drive pins at 1.0 / drives max-intensity
   behaviour at a vulnerable user indefinitely. A focal drive resolves the moment its
   discharge fires.
5. Thresholds: `ACTIVATION_THRESHOLD` 0.5 → 0.42; the unused `RELEASE_THRESHOLD` was
   removed (the claimed two-threshold hysteresis was never wired — chatter is damped by
   the per-turn rate-limit + refractory window instead).

Safety budget (stage-capped disclosure ceiling + manipulationGuard + restraint) is
unchanged and still gates EXPRESSION — the tuning raises activation *frequency*, the
safety layer bounds activation *consequence*. Crisis/repair/consent still short-circuit
before the psyche runs. Rollback = set any `wrangler.toml` psyche flag to `"false"`.
