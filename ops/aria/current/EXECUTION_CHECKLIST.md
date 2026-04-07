# Execution Checklist

1. Read `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`.
2. Read `ops/aria/current/NEXT_EXECUTION_SLICE.md`.
3. Read only the 1-3 referenced source files needed for the current slice.
4. Implement only inside the allowed file set for the active slice.
5. Run required verification commands before claiming success.
6. After every material result, update:
   - `PROJECT_MEMORY_LEDGER.md`
   - `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
   - `ops/aria/current/NEXT_EXECUTION_SLICE.md` if the active slice changed
   - one new `ops/aria/log/YYYY-MM-DD-*.md` file
7. Run `scripts/sync-agent-adapters.ps1` or use `scripts/checkpoint-work.ps1` without `-SkipAdapterSync`.
8. Create a scoped checkpoint commit.

## Rules

- Do not explore broadly unless blocked.
- Do not reload full project history by default.
- Do not touch files outside the allowed slice unless the packet explicitly changes.
- Do not mix unrelated dirty-tree files into checkpoint commits.
- Use repo-local memory as authoritative when current and consistent.
