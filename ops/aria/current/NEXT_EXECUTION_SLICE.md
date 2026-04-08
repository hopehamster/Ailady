# Next Execution Slice

## Title

Run the live tester-readiness sweep for voice, modes, and self-awareness

## Goal

Use the shipped readiness artifacts to validate the deployed backend/client changes on an attached Android device. The purpose of this slice is to turn remaining `partial` migration-gate items into evidence-backed `live` items where warranted, or name the specific blockers if not.

## Files Allowed To Change

- `PROJECT_MEMORY_LEDGER.md`
- `ops/aria/current/LOW_TOKEN_EXECUTION_PACKET.md`
- `ops/aria/current/NEXT_EXECUTION_SLICE.md`
- `ops/aria/current/active-work.md`
- `ops/aria/current/known-regressions.md`
- `ops/aria/current/pre-heygen-migration-gate.md`
- `tools/girlai2/docs/VOICE_READINESS_PASS.md`
- `tools/girlai2/docs/FEATURE_READINESS_MATRIX.md`
- `tools/girlai2/docs/CAPABILITY_READINESS_PROMPT_PACK.md`
- one new `ops/aria/log/YYYY-MM-DD-*.md`

## Files Not To Change

- backend and Flutter source files unless live validation reveals a concrete defect that requires a bounded fix
- temp artifacts under `tools/girlai2/docs/_tmp_*`

## Invariants To Preserve

- `llmService.ts` shrink phase remains complete for now.
- The clean repo remains the only active implementation repo.
- The pre-HeyGen migration gate should only be promoted from `partial` to `live` using real tester evidence.

## Acceptance Criteria

- Voice, mode, and self-awareness sweeps are run on a live attached device.
- `ops/aria/current/pre-heygen-migration-gate.md` is updated from observed evidence.
- The result is a clear verdict:
  - ready for structured tester pass
  - or still blocked, with named blockers only

## Checkpoint Instruction

- Use a scoped checkpoint commit after the live sweep writeback is complete.
