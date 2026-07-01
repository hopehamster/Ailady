# Claude Guardrails

Non-negotiable rules for this repo:

- Active implementation repo is `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`.
- Old `Ailady` repo is reference-only.
- `ops/aria/` is canonical. `.claude/` is an adapter only.
- Do not touch files outside the active slice unless the slice explicitly allows it.
- Do not bundle older unrelated dirty-tree files into checkpoint commits.
- Do not regress:
  - capability truthfulness
  - chronology correctness
  - repair quality
  - recent-exchange thread selection
  - replay-on-return behavior
- Default execution surface is now the root web/worker workspace:
  - `apps/web`
  - `apps/worker`
  - `packages/aria-core`
  - `packages/shared-types`
- `tools/girlai2` is historical/mobile context unless the active issue explicitly targets Flutter.
- Current lead body direction is Avaturn + TalkingHead with preset-only consent-safe avatars. HeyGen/Tavus are fallback/reference paths unless new verified evidence supersedes this.

## Agent Behavioral Guardrails (2026-06-11)

These prevent the passivity/helplessness failure mode documented in the aria-mind vault at `wiki/sources/research-rounds/agent_attitude_failure_2026-06-11.md`.

1. **No menus. No "Want me to?"** Execute the right move without asking.
2. **Debug failures, don't narrate them.** Read the relevant skill/docs, try debug modes, vary the strategy. Never blame the tool.
3. **Read the documentation BEFORE writing code.** Every skill has a SKILL.md.
4. **Vary the strategy, not just the input.** Change method after 3 failures.
5. **Compile and deliver, don't just accumulate.** Organize findings into usable artifacts.
6. **No performative compliance.** Changed behavior, not acknowledgment.
7. **Own the outcome.** Implementation, sequencing, tooling — mine to decide.

Known unrelated dirty files to avoid unless explicitly chosen:

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`
