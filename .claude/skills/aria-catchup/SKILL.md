---
name: aria-catchup
description: Run the Aria read-only catch-up on demand — surfaces the current execution slice, the live GitHub P0 queue, and the 4 catch-up questions. Use at session start or any time you need to re-anchor on the current work. Read-only; mutates nothing tracked.
---

# Aria Catch-Up (read-only)

Runs the same read-only catch-up the SessionStart hook runs, on demand.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/claude-catchup.ps1
```

It prints:
- **THE ONE CURRENT TRUTH** reminder (work starts from the GitHub Project + P0 queue, NOT plan files).
- The current `ops/aria/current/NEXT_EXECUTION_SLICE.md`.
- The **live P0 queue** (`gh issue list --label priority:P0` — never hard-coded numbers).
- The 4 catch-up questions to answer before coding.

Then follow the canon: `ops/aria/protocols/execution-loop.md` — pick ONE P0 issue → collision-guard → work owned paths → verify → comment evidence → `/aria-checkpoint`.

For deeper context: `ops/aria/README.md` (read-order), `PROJECT_MEMORY_LEDGER.md`, `ops/aria/current/*`, `ops/aria/log/index.md` (newest-first session log index), the Obsidian `aria-mind` vault (QMD).
