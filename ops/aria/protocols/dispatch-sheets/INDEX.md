# Dispatch Sheet Index

> All dispatch sheets live in `ops/aria/protocols/dispatch-sheets/`. This index maps agent → wave → task. Update when sheets are completed or new waves are planned.

**Required fields per dispatch sheet (issue #28):** every sheet (and every dispatch prompt) MUST declare **Writable paths** (exact repo-relative globs the worker may touch — nothing else) and **Claimed paths** must be registered as an `active` entry in `ops/aria/current/claims.json` BEFORE dispatch. The lead runs `pwsh scripts/ops/check-collisions.ps1` (must PASS) before launching the wave, and again after each claim change. Handoff back to the lead requires: changed files, verification, risks, issue evidence (worker return format in `../web-first-multi-agent-execution.md`).

## Wave 1 — Zero Dependencies, Full Parallel

| ID | Agent | Task | Effort | Status |
|---|---|---|---|---|
| W1-P | P — Psyche | Phase A diagnosis: confirm H2+H3 via pure-layer harness | 2-3h | ✅ Done |
| W1-S | S — Security | Phase 0 tooling: install nuclei/retire.js, stand up auth spike | 1-2h | ✅ Done |
| W1-I | I — Infra | Add fast-check, verify scaffold health, document dep state | 0.5-1h | ✅ Done |
| W1-M | M — Memory | Extract IntelligentMemory type closure to shared-types | 2-3h | ✅ Done |

**Wave 1 completion gate:** All 4 returned → L compiled results. P's diagnosis confirms H2+H3, I's fast-check ready, M's types extracted (typecheck CLEAN), S's tools installed (nuclei v3.9.0, retire 5.4.3).

## Wave 2 — Depends on Wave 1

| ID | Agent | Task | Effort | Depends On | Status |
|---|---|---|---|---|---|
| W2-P | P — Psyche | T1 pure-layer property sweep (fast-check, ≥8 invariants, ≥10K runs) | 4-6h | W1-M, W1-I | ✅ Done — 8 invariants, 80K runs, 39 tests green |
| W2-W | W — Web | T3 body-fidelity baseline (8-mood Playwright sweep) | 3-4h | None* | ✅ Done — 8/8 moods pass, canvasNonBlank>1000, emotion hook correct |
| W2-S | S — Security | Phase 1 automated breadth scans (nuclei, ffuf, sqlmap) | 3-4h | W1-S | ✅ Done — 0 CVEs, 0 exposed endpoints, 1 HIGH (CORS wildcard), 0 npm vulns |

*W2-W can start immediately — no dependency on Wave 1. Parallel with Wave 1 is fine.

**Wave 2 completion gate:** P's invariants pass + W's 8 moods render + S's scans documented.

## Wave 3 — Depends on Wave 2

| ID | Agent | Task | Effort | Depends On | Status |
|---|---|---|---|---|---|
| W3-P | P — Psyche | T2 live-arc batch driver (5 arcs through /api/chat, spend-capped) | 4-6h | W2-P, worker running | Ready |
| W3-L | L — Lead | T4 parallel grader fleet + adversarial verification | 3-4h | W3-P (needs transcripts) | Ready |
| W3-M | M — Memory | D1 schema for intelligent_memory + scored_messages | 3-4h | W1-M | Ready |

## Wave 4 — Depends on Wave 3

| ID | Agent | Task | Effort | Depends On | Status |
|---|---|---|---|---|---|
| W4-P | P — Psyche | Phase C fixes (H3 warm fallback + H2 deflection arc) | 2-3h | W3-P | Ready |
| W4-L | L — Lead | T5 continuous regression + ablation + adversarial discovery | 3-4h | W3-P, W3-L | Ready |

## Wave 5 — GO/NO-GO Gate (planned, not yet written)

| ID | Agent | Task | Effort | Depends On | Status |
|---|---|---|---|---|---|
| W5-L | L — Lead | Compile GO/NO-GO verdict from all harness results | 1-2h | W4-P, W4-L | Planned |
| W5-W | W — Web | Phase D body-fidelity deepening (emotion intensity + voice prosody) | 1d | W2-W, W4-P | Planned |
| W5-S | S — Security | Phase 2 auth deep-dive + Phase 3 LLM red-team | 1-2d | W2-S | Planned |

## Completed

*None yet — dispatch begins now.*
