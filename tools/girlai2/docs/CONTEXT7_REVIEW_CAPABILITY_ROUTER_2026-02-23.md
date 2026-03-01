# Context7 Review - Capability Router (2026-02-23)

## Proof of Context7 Usage
- Raw log: `tools/girlai2/docs/_tmp_context7_review/20260222_200612/codex_context7_exec.jsonl`
- Context7 MCP calls in log:
  - `mcp_tool_call` to `server: "context7"`, tool `get-library-docs` (rate-limited response)
  - `mcp_tool_call` attempts for `list_mcp_resources` and `list_mcp_resource_templates`
- Verification command:
  - `rg -n "mcp_tool_call|context7|get-library-docs" tools/girlai2/docs/_tmp_context7_review/20260222_200612/codex_context7_exec.jsonl`

## What Context7 Review Changed
Even with rate limiting, the Context7-driven review surfaced concrete hardening actions that were applied:

1. Truthful fallback states (unknown vs false negatives)
- Updated runtime capability fields to allow unknown values.
- Files:
  - `tools/girlai2/functions/src/services/llmService.ts`
  - `tools/girlai2/functions/src/services/personalityService.ts`
- Result:
  - On fallback runtime, voice/vision/proactive states are now `null` (unknown), not forced `false`.
  - User-facing capability disclosure now states uncertainty instead of wrongly saying features are off.

2. Capability intent routing precision
- Tightened capability intent detection scoring in:
  - `tools/girlai2/functions/src/services/llmService.ts`
- Result:
  - Reduced accidental routing from generic identity-only prompts.
  - Added cue scoring and threshold to route only when capability intent is clear.

3. Concise-by-default capability output
- Added concise mode with optional expanded detail triggers in:
  - `tools/girlai2/functions/src/services/llmService.ts`
- Result:
  - Capability answers are shorter by default.
  - Full detail and demo prompts show only when explicitly requested.

4. Safer comparative wording
- Replaced broad promotional wording with bounded, factual phrasing in:
  - `tools/girlai2/functions/src/services/llmService.ts`
- Result:
  - Better trust/accuracy posture for self-description.

## Validation
- TypeScript build passed after changes:
  - Command: `npm run build`
  - Directory: `tools/girlai2/functions`

## Notes
- Context7 returned rate-limit responses during this session, but MCP usage is explicitly logged above.
- The hardening changes were implemented directly from the Context7-led review findings and compiled successfully.
