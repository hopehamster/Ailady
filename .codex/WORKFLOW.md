# Codex Workflow

Default flow for Aria work:

1. Read `.codex/CATCHUP.md`.
2. Read `.codex/ACTIVE_SLICE.md`.
3. Read `ops/aria/current/project-tracking.md`.
4. Check GitHub Project `Aria Product OS`.
5. Pick the highest-priority issue that matches the user request.
6. Read the linked dispatch sheet, issue body, or ops doc.
7. Implement one bounded slice only.
8. Verify with the command that proves the claim.
9. Comment evidence on the GitHub issue when material.
10. Write back:
    - `PROJECT_MEMORY_LEDGER.md`
    - relevant `ops/aria/current/*`
    - one dated `ops/aria/log/*.md`
    - Obsidian when the result is substantial
11. Run `scripts/sync-agent-adapters.ps1`.
12. Create a scoped checkpoint commit if requested or if the slice is ready to checkpoint.

## Default Verification

For root web/worker work:

```powershell
pnpm -r --if-present typecheck
pnpm -r --if-present test
pnpm -C apps/web test:e2e:ci
pnpm security:gate
```

For live web behavior:

```powershell
ARIA_REAL_API=1 pnpm -C apps/web exec playwright test --grep "@real"
```

For Flutter/mobile work, use the relevant `tools/girlai2` verification docs and device sweep skills.

## If Blocked

- read `ops/aria/current/EXECUTION_CHECKLIST.md`
- read only the canonical deeper docs needed for the block
- update the GitHub issue with the blocker and evidence

Do not broaden scope just because more work is visible.
