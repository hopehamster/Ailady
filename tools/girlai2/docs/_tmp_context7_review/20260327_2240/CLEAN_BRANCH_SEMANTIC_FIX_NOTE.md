# Clean Branch Semantic Fix Note

Context7 library used:
- `/websites/developers_openai_api`

Query focus:
- keeping dynamic conversation context separate from system instructions
- keeping corrective responses concise
- preserving explicit multi-turn conversation state

How it informed this pass:
- confirmed the refactor direction of pushing truth, memory, and policy context into dedicated service-owned blocks instead of accreting more ad hoc prompt text in `llmService.ts`
- reinforced the repair fix: when the user corrects the model, the corrective response should anchor to the underlying recent state, not the literal correction prompt itself
- reinforced documenting the clean-branch semantic sweep as a permanent repo artifact rather than leaving the result chat-only
