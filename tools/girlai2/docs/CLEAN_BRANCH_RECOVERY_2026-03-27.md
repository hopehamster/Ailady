# Clean Branch Recovery 2026-03-27

## Branch
- `aria-clean-recovery-20260327`
- base: `sdk-updates` @ `95651a0`

## Purpose
Curated recovery branch containing the active Aria product work from the dirty `sdk-updates` worktree without deleting or mutating the original dirty tree.

## Included
- Active product code under `tools/girlai2/functions/src`
- Active Flutter app/runtime changes under `tools/girlai2/lib`
- Native Live2D / Android runtime fixes under `tools/girlai2/android/app/src/main`
- Selected engineering docs and program docs under `tools/girlai2/docs`
- Selected repo-local tooling and regression assets:
  - `tools/girlai2/scripts/aria_device_test.ps1`
  - `tools/girlai2/scripts/build_android_debug.ps1`
  - emulator helper scripts
  - prompt packs
  - `tools/girlai2/.github/workflows/android-test.yml`
  - `tools/girlai2/test/unit/avatar/avatar_motion_controller_test.dart`
- `AGENTS.md`
- `PROJECT_MEMORY_LEDGER.md`

## Intentionally Excluded
- Root duplicate app tree `girlai2/` (stale scaffold)
- Nested `flutter/` checkout
- `backend/package.json` stub
- Temporary screenshots, XML dumps, logcat captures, `_tmp_*` artifact trees
- Generated build/cache output
- Risky local/service credential files and provisioning deletes
- Root package/tooling churn unrelated to active Aria app

## Validation
- `npm run build` in `tools/girlai2/functions`: pass
- `flutter pub get` in `tools/girlai2`: pass
- `dart analyze` targeted active surfaces: pass with 5 info-level issues only

## Notes
- Original dirty tree remains untouched in `C:\Users\Owner\Documents\GitHub\Ailady` on branch `sdk-updates`.
- This branch is the clean candidate for continuing Aria stabilization, responsiveness, persona refactor, and animation work.
