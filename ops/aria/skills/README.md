# Aria Skills

This folder is reserved for repo-local Aria workflow skills.

The goal is to keep repeated Aria operating knowledge local, compact, and tool-neutral.

## Planned First Wave

- `aria-resume-context`
- `aria-memory-writeback`
- `aria-device-regression`
- `aria-latency-pass`
- `aria-persona-pass`

## Rules

- skills should reference canonical Aria memory under `ops/aria/`
- skills should not create competing project truth
- if a skill changes current state, the result must still be written back to:
  - `PROJECT_MEMORY_LEDGER.md`
  - `ops/aria/current/*`
  - `ops/aria/log/*`
