# Git Checkpoint Protocol

Use this protocol so meaningful Aria work does not stay uncommitted by accident.

## Rule

After a material result is verified and local memory writeback is complete, create a checkpoint commit in the active repo unless the user explicitly asked not to.

## Material Result Examples

- product fixes
- architecture refactors
- prompt-cost passes
- deploy/readiness documentation changes
- regression findings and harness improvements

## Required Flow

1. update `PROJECT_MEMORY_LEDGER.md`
2. update relevant `ops/aria/current/*`
3. add a dated `ops/aria/log/*` entry if the result is substantial
4. run `scripts/checkpoint-work.ps1 -Message "..."`
5. if the repo already has unrelated or pre-existing edits, use `-OnlyPaths` to commit only the verified scope of the current pass
6. report what was committed

## Safety Rules

- commit only in the active repo
- do not include temp artifacts unless they are intentionally part of the result
- do not include generated junk like `.gradle/` caches
- do not commit unrelated changes from other projects
- on a dirty tree, prefer `-OnlyPaths` over a whole-tree checkpoint
