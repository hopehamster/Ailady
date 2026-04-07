# Codex Workflow

Default flow for routine Aria work:

1. Read `.codex/CATCHUP.md`.
2. Read `.codex/ACTIVE_SLICE.md`.
3. Follow the allowed file set from the active slice.
4. Read only the minimum extra source files needed.
5. Implement one bounded slice only.
6. Verify before claiming success:
   - `npm run build`
   - `npm test`
7. Write back:
   - `PROJECT_MEMORY_LEDGER.md`
   - relevant `ops/aria/current/*`
   - one dated `ops/aria/log/*.md`
8. Run `scripts/sync-agent-adapters.ps1`.
9. Create a scoped checkpoint commit.

If blocked:

- read `ops/aria/current/EXECUTION_CHECKLIST.md`
- then read only the canonical deeper docs needed for the block

Do not broaden scope just because more work is visible.
