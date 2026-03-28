# Aria Fuller Animation Pass - 2026-03-27

## Scope
Avatar-motion-only tuning from the current runtime baseline:
- fuller speaking motion
- better idle life
- quieter head-space reaction bubbles
- no destabilization of chat / Live2D lifecycle

## Changed Files
- `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`
- `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`

## What Changed

### Speaking fullness
- Increased torso follow-through in the speaking loop.
- Added a `bodyScale` dimension to the talk presets so torso motion is not just derived from head motion.
- Strengthened body, shoulder, and arm/hand energy during engaged speech while keeping the calm preset restrained.

### Idle life
- Preserved the existing idle motion controller baseline.
- Kept speaking/idle separation intact so idle motion does not fight the speaking layer.

### Thought-bubble behavior
- Moved reaction bubbles into head/background-space slots instead of drifting as loose particles.
- Removed center drift so bubbles appear and disappear in-place.
- Reduced wobble and visual flash so the overlay reads as silent thought-bubbles rather than fireworks.

## Validation
- Targeted Dart analysis passed:
  - `dart analyze lib/features/avatar/widgets/avatar_view.dart lib/features/avatar/widgets/avatar_reaction_overlay.dart lib/features/avatar/motion/avatar_motion_controller.dart lib/features/avatar/live2d/live2d_bridge.dart`
- Result:
  - `No issues found!`

## Unresolved Risks
- This pass is analyzer-verified, but not yet revalidated on a physical device in this exact compacted turn.
- The fuller speaking motion is still constrained by the current rig parameter set; if the artist export exposes more arm/body channels later, the motion layer can be widened again.
- Thought-bubble placement is now more head-anchored, but exact visual balance still needs a short device glance on the primary phone.

## Ledger-Update Summary
- Fuller speaking motion is now more body-led rather than head-led.
- Reaction bubbles now behave like quiet thought bubbles around Aria's head/background space.
- Analyzer is clean, so the pass did not introduce compile regressions in the avatar-motion files.

## Context7 Note
- Context7 was used for frame-budget and custom-paint guidance while tuning the overlay and motion cadence.
- Key takeaways applied here:
  - keep per-frame work lightweight
  - prefer a custom paint overlay for reaction bubbles
  - stay within a 16 ms frame budget for smooth animation

## 2026-03-27 Motion Follow-Up After Specialist Review

### Additional fixes landed

1. Reduced view-transform overcounting of speech energy in `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`.
- The speech-energy contribution in `_composeSpeechViewFrame(...)` is now damped so the screen-space layer does not fight the already-speaking-aware motion controller.
- Intended effect:
  - fuller motion remains
  - high-energy speech should feel less jittery / less over-animated

2. Made thought bubbles intermittent and locally randomized in `tools/girlai2/lib/features/avatar/widgets/avatar_reaction_overlay.dart`.
- Bubbles now:
  - use per-bubble visibility spans instead of being always-on
  - appear around fixed head-space slots with subtle wobble
  - disappear in place with the existing quiet pop-ring behavior
- Intended effect:
  - more like silent thought bubbles
  - less like a repeating ambient UI loop

### Device validation

- Rebuild + reinstall on `70578ba3` completed successfully after the motion follow-up.
- Latest focused device run:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523`
- Useful screenshots:
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523/step_01.png`
  - `tools/girlai2/docs/_tmp_aria_device_test/70578ba3/20260327_061523/step_02.png`

### Current truth

- The runtime speaking layer is now fuller and safer.
- The thought-bubble overlay is now much closer to the intended design language.
- The next animation work should focus on polish, range expansion, and better gesture variety rather than fixing the basic motion architecture again.
