# Context7 Protocol

Use Context7 before acting on uncertain training knowledge.

## Always Use Context7 First For

1. library, framework, API, and SDK usage
2. MCP server installation or configuration
3. tool configuration and CLI flags
4. troubleshooting where the tool/library docs matter
5. any situation where current documentation may differ from memory

## Aria-Specific Priority Cases

- OpenAI / Firebase / Flutter / Android / Playwright / MCP config questions
- Codex config questions
- installation or auth setup for external tools
- any planned HeyGen WebView integration work

## Required Flow

1. resolve the correct Context7 library ID
2. query the relevant docs with a specific question
3. apply the answer to the local task
4. if documentation materially changed the decision, record that in local memory

## What Not To Do

- do not guess install methods
- do not assume config formats from memory when docs are available
- do not cite Context7 unless it was actually used

## Writeback Rule

If Context7 materially changes an architecture or tooling decision, update:

- `PROJECT_MEMORY_LEDGER.md`
- relevant `ops/aria/current/*`
- a dated `ops/aria/log/*` entry
