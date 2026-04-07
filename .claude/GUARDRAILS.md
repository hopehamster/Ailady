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
- Do not start serious `HeyGen WebView` implementation yet.

Known unrelated dirty files to avoid unless explicitly chosen:

- `tools/girlai2/functions/src/services/conversationPolicyService.ts`
- `tools/girlai2/functions/src/services/truthKernelService.ts`
- `tools/girlai2/docs/ARIA_CURRENT_TASK_BOARD.md`
