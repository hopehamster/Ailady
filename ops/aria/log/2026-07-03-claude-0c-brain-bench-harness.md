---
type: session
issue: "#37"
created: 2026-07-03
---
# 0c-brain-bench-harness — synchronous provider-tagged blinded brain-bench generator (epic #35 / #37)

> 0C step 1 of 2: the harness. The bench RUN + flip-gate scoreboard follow in a subsequent checkpoint (bench executing in background at checkpoint time).

- **Goal:** Build the synchronous, provider-tagged, blinded brain-bench generator that lets *evidence* pick Aria's production brain from the candidate field — per the owner-confirmed "option 3" (bench all candidates).

- **Work done:**
  1. **Fusion research** (`last30days`): confirmed **OpenRouter Fusion** is real (launched ~2026-06-14), an inference-time ensemble/compound model, **OpenAI-compatible via an OpenRouter key**, benchmarking at/above Fable-5-solo (~65%) at ~½ price — the market's Fable-5 stand-in. Amended `~/.claude/plans/i-want-psyche-polish-humble-fairy.md` (Owner-decisions amendment) + evidence comments on #37/#36.
  2. **Mapped the free-inference arsenal** in `~/.claude/.secrets` (redacted): NVIDIA Build, OpenRouter ×2, Groq, Cerebras, Cloudflare Workers AI, Z.ai, Kimi K2.5, Qwen, MiniMax, Mistral, Cohere, Gemini ×5 — the "symphony" pool for brains + cross-provider graders.
  3. **Built `scripts/psyche/brain-bench.ts`** — single-turn direct-OpenAI-compat generator: each candidate answers the *same* fixed per-turn context (clean model-quality signal); emits per-candidate **provider-BLIND** transcript files + a manifest (provider→blind label, latency p50/p95, tokens, previews, seed). Key rotation + `Retry-After`/exponential backoff + **fail-skip** (owner directive: "if a key fails work around it, dont stop working"). Reuses the trusted, already-provider-blind `grade-transcripts.ts` for scoring. Candidate registry: incumbent `deepseek-chat`, `glm-5.2` (NVIDIA), `deepseek-v4-pro` (NVIDIA) enabled; `fusion` (OpenRouter) disabled until access + model id confirmed.

- **Files changed:** `scripts/psyche/brain-bench.ts` (new). (Plan amendment is in `~/.claude/plans/` — outside repo; #37/#36 comments are GitHub-side.)

- **Commands + evidence:**
  - Smoke: `ONLY=glm-5.2 node scripts/psyche/brain-bench.ts` → glm-5.2 produced real Aria-quality replies with per-turn latency (~500ms–5s); when NVIDIA free tier returned HTTP 429 it rotated + backed off then **recorded-and-continued** every remaining turn (fail-skip proven).
  - Symphony hardening: `Retry-After`-aware + exponential wait-out (→20s) + 1.5s pacing added after the smoke exposed NVIDIA's single-key per-minute limit.
  - Full 3-candidate bench running in background (task `b4adlaf4l`) at checkpoint time.
  - Gate: tooling/scripts change (not product source) → web/security gates N/A; verification = the live smoke run above.

- **Decisions:**
  - **Test brains = free OpenAI-compat "symphony"** (NVIDIA + others), NOT the unfunded/likely-pulled Anthropic key. Bench **all candidates** (option 3); evidence picks.
  - **Fable-5-as-brain reframed** to "benched, not assumed" (probe hit credit/access; community says API pulled). **OpenRouter Fusion = the Fable-5 stand-in**, deferred (no access yet — slot wired).
  - **0B demoted**: candidates are all OpenAI-compat → the Anthropic-SDK-on-`workerd` preflight is off the critical path; keep only the function-time flag hygiene.
  - **Targeted ultracode** (owner): workflows for the fan-out + adversarial-verify gates (grade-symphony, flip-decision skeptics, 0C safety re-validation, Phase-5 holdout); scripts + flag-gated coding stay inline.

- **Open items:**
  - Full bench run completing (background) → then **grade-symphony + flip-gate scoreboard** (ultracode workflow) + **0C safety re-validation** vs the winning brain → checkpoint 0C step 2.
  - NVIDIA single-key rate limit: if too many 429-skipped turns to grade fairly, spread each model across its other free hosts (Groq/Cerebras/Z.ai/OpenRouter).
  - Fusion candidate pending owner's OpenRouter Fusion access.

- **Next issue:** #37 (0C grading + scoreboard, then safety re-validation) → #38 (0D coverage arcs + grader backend + baselines).
