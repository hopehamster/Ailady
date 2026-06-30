# Codex Guardrails

Non-negotiable rules for this repo:

- Active implementation repo is `C:\Users\Owner\Documents\GitHub\Ailady_clean_20260327`.
- Old `Ailady` repo is reference-only.
- `ops/aria/` is canonical. `.codex/` is an adapter only.
- Current default execution surface is the root pnpm web/worker workspace, not the old Flutter lane.
- Do not touch files outside the active GitHub issue/slice unless the slice explicitly allows it.
- Do not bundle older unrelated dirty-tree files into checkpoint commits.
- Do not ask the user to manually verify browser behavior; use Playwright or desktop/browser automation and report measured evidence.
- Do not regress:
  - capability truthfulness
  - chronology correctness
  - repair quality
  - recent-exchange thread selection
  - replay-on-return behavior
- Do not resurrect HeyGen as the lead body path without checking the June avatar decision; current lead path is Avaturn + TalkingHead, with Tavus as photoreal fallback.
- Use GitHub Issues/Projects for execution status.

Known unrelated dirty files to avoid unless explicitly chosen:

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`

Current tracking files:

- `ops/aria/current/project-tracking.md`
- `ops/aria/protocols/project-tracking-protocol.md`
- GitHub Project `Aria Product OS`
