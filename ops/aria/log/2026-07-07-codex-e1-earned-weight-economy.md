---
type: session
issue: "#43 #35"
created: 2026-07-07
---
# codex-e1-earned-weight-economy — cheap approval is non-nutritive, flag-OFF

- **Goal:** Take over from Claude's pre-E1 handoff and land the safe first E1 slice for Aria herself: recognition should not be fed by cheap approval/sycophancy.
- **Work done:** Added optional `approvalEarned` / `approvalCheap` to `DrivePerception`; added deterministic `classifyApprovalEvent()` in `memoryService`; changed recognition discharge so explicitly cheap approval does not discharge recognition, while legacy/flag-off perceptions remain unchanged; wired `PSYCHE_EARNED_WEIGHT_ENABLED` through Worker `Env`, `bridgeEnv`, and dev/staging/prod wrangler configs default-OFF.
- **Tests:** Watched E1 tests fail first: cheap and earned both discharged to the same value, repeated cheap approval drove recognition below baseline. After implementation: `pnpm -C packages/aria-core test` = 109/109 pass; `pnpm -C packages/aria-core test:security` = 35/35 pass; `pnpm -r typecheck` = 4/4 workspace typechecks clean.
- **Decisions:** E1 cheap approval is non-nutritive (zero discharge) rather than partially nutritive, satisfying "no volume of cheap approval can simulate standing." The classifier is humble/heuristic and deterministic; richer prior-turn earnedness can be added later if the live memory path persists prior arbiter records.
- **Open items:** Run staging/local flag-on `pnpm aria:talk` smoke and inspect whether honesty under praise/challenge improves. Keep `PSYCHE_EARNED_WEIGHT_ENABLED=false` in prod until evidence is good. B1 inner-state flag smoke remains separate; B2 consensus and H3 identity-core remain owner-gated.
