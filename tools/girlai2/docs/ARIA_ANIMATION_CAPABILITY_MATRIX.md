# Aria Animation Capability Matrix

Date: 2026-03-23
Scope: `tools/girlai2` current Live2D runtime + current Bezzly export

## Purpose

This document answers two questions with repo-backed facts:

1. What parts of Aria can we animate right now from the existing rig and export?
2. Which new animations can we create immediately, and which ones require artist work?

It also records the decision process so we can reuse the same method later.

## Decision Process We Should Reuse

When evaluating any future animation idea, use this order:

1. Check the exported runtime files in `tools/girlai2/assets/live2d/bezzly/`.
2. Check `bezzly.model3.json` for:
   - expressions
   - lip sync group
   - eye blink group
   - motion groups
3. Check `bezzly.cdi3.json` for actual parameter IDs and human-readable names.
4. Check current runtime control code in `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`.
5. Classify each idea into one of these buckets:
   - `Runtime-animatable now`
   - `Runtime-animatable now, but needs tuning`
   - `Possible from source cmo3 later`
   - `Artist required`

Rule:

- If the exported model already exposes the parameter, we can animate it now.
- If the export does not expose the needed deformation or motion group, Remotion or Dart cannot invent that rig capability.
- If the source `cmo3` exists, future rig edits are possible, but that is still a separate step from current runtime control.

## Current Asset Facts

Current runtime export:

- `tools/girlai2/assets/live2d/bezzly/bezzly.model3.json`
- `tools/girlai2/assets/live2d/bezzly/bezzly.cdi3.json`
- `tools/girlai2/assets/live2d/bezzly/bezzly.physics3.json`
- `tools/girlai2/assets/live2d/bezzly/Happy.exp3.json`
- `tools/girlai2/assets/live2d/bezzly/Sad.exp3.json`
- `tools/girlai2/assets/live2d/bezzly/Angry.exp3.json`

Important source file present:

- `docs/live2d_source/bezzly/bezzly.cmo3`

Important limitation:

- The current `bezzly.model3.json` has expression references, but no authored `.motion3.json` motion groups wired into the export.
- That means we currently rely on procedural runtime parameter driving, not authored Live2D motions.

## What The Current Rig Exposes

Confirmed from `bezzly.model3.json` and `bezzly.cdi3.json`:

### Face and head

- `ParamAngleX`
- `ParamAngleY`
- `ParamAngleZ`
- `ParamBodyAngleX`
- `ParamBodyAngleY`
- `ParamBodyAngleZ`
- `ParamEyeLOpen`
- `ParamEyeROpen`
- `ParamEyeLSmile`
- `ParamEyeRSmile`
- `ParamEyeBallX`
- `ParamEyeBallY`
- `ParamBrowLY`
- `ParamBrowRY`
- `ParamBrowLX`
- `ParamBrowRX`
- `ParamBrowLAngle`
- `ParamBrowRAngle`
- `ParamBrowLForm`
- `ParamBrowRForm`
- `ParamMouthOpenY`
- `ParamMouthForm`
- `ParamCheek`
- `ParamBreath`

### Existing named expressions

- `Happy`
- `Sad`
- `Angry`

These map to:

- `Happy.exp3.json`: `Param2`, `ParamEyeLSmile`, `ParamEyeRSmile`, `ParamMouthForm`
- `Sad.exp3.json`: `Param`, `ParamMouthForm`
- `Angry.exp3.json`: `Param3`, `ParamMouthForm`

### Body, hair, cloth, accessory

- `Param11` to `Param20`: front hair / side hair movement
- `Param23` to `Param27`: cloth movement
- `Param28`, `Param29`: arm-related parameters
- `Param34` to `Param41`: ear rotation / ear deformation parameters
- `Param42`, `Param43`: body-related parameters

### Hands

- `HandLeftAngleX`
- `HandLeftAngleZ`
- `HandLeftOpen`
- `HandLeftFinger_1_Thumb` through `HandLeftFinger_5_Pinky`
- `HandRightAngleX`
- `HandRightAngleZ`
- `HandRightOpen`
- `HandRightFinger_1_Thumb` through `HandRightFinger_5_Pinky`

## What The Current Runtime Already Uses

Confirmed in `tools/girlai2/lib/features/avatar/widgets/avatar_view.dart`:

- mouth open and mouth form lip-sync
- eye blink scheduling
- eye target drift
- head sway
- body sway
- breath
- speaking motion
- arm and hand opening movement
- hair and cloth idle motion
- screen-space movement via `setViewTransform()`

This means Aria is not limited to only mouth movement. The rig and runtime already support a broader motion range. The problem is quality and choreography, not total absence of controls.

## What We Can Animate Right Now

These are all `Runtime-animatable now`.

### Immediate face work

- Better blinking patterns
- Eye saccades and gaze shifts
- Eye openness during speaking and listening
- Smile-in / smile-out transitions
- Brow raises, brow softening, brow concern, brow anger
- Mouth smile shaping separate from lip-sync
- Cheek warmth / blush-adjacent cheek parameter use
- Head turns and tilts
- Subtle body follow-through from head movement

### Immediate speaking behavior

- Calm speaking loop
- Engaged speaking loop
- Excited speaking loop
- Shy / soft speaking loop
- Sad speaking loop
- Angry speaking loop
- Short emphasis nods on sentence peaks
- Listen-to-speak transitions
- Speaking posture changes tied to emotion intensity

### Immediate body and hand work

- Left-right torso sway
- Weight-shift illusions
- Arm openness changes during speech
- Hand openness pulses during speech
- Small hand angle changes for livelier talk
- Hair follow-through
- Cloth follow-through

### Immediate screen-space motion

- Lean in when engaged
- Pull back when shy
- Small bounce when excited
- Tight shake burst when angry
- Floating drift during romantic / playful states
- Silent idle mood cycle

### Immediate overlay and staging work

- Hearts
- Sparkles
- Soft symbol bursts
- Caption choreography
- Date mode visual presets
- Live mode UI posture presets

## New Animations We Can Create Immediately

These do not require new artist exports.

### Category A: Procedural motion clips

We can create these now by driving existing parameters and screen-space transforms:

- `Idle_Listen_Soft`
- `Idle_GazeShift_Light`
- `Idle_ShiftWeight_Small`
- `Talk_Calm`
- `Talk_Engaged`
- `Talk_Excited`
- `Talk_Shallow_Shy`
- `Talk_Sad_Soft`
- `Talk_Angry_Tight`
- `React_Nod_Small`
- `React_HeadTilt_Soft`
- `React_LookAway_Shy`
- `React_SmileIn_Soft`
- `React_Attentive_Lean`
- `React_Playful_Sway`

These are not authored `.motion3.json` files. They are runtime motion behaviors composed from existing params.

### Category B: Expression expansions from existing parameters

We can create additional usable runtime expressions without artist help by combining:

- eye openness
- eye smile
- brows
- mouth form
- cheek
- head/body angle

Examples we can make now:

- soft smile
- caring
- shy
- playful
- attentive
- thoughtful
- relieved
- mildly surprised
- flirty-soft
- concerned

These will be runtime-authored expressions, not Cubism Editor-authored export expressions.

### Category C: Remotion-assisted authoring outputs we can create now

Remotion can help us author and tune:

- timing curves
- state transitions
- speaking loops
- idle loops
- screen-space drift
- overlay bursts
- per-emotion choreography presets

The output should be JSON motion presets consumed by the Flutter runtime, not direct replacement of Live2D rendering.

## What Requires The Artist

These are `Artist required` or `Possible from source cmo3 later`.

### True authored Live2D motion files

If we want real exported motion clips like:

- `Idle_Listen_A`
- `Idle_Listen_B`
- `Idle_Breath_Soft`
- `Idle_GazeShift`
- `Idle_ShiftWeight`
- `Talk_Neutral_Soft`
- `Talk_Engaged`
- `Talk_Happy`
- `Talk_Sad`
- `Talk_Angry`
- `React_Nod`
- `React_HeadTilt`
- `React_SmileIn`
- `React_Surprised`
- `React_ShyLookAway`

then the artist needs to author and export `.motion3.json` clips, or we need to do that ourselves from the `cmo3` in Cubism Editor.

### New deformation range

Artist or Cubism source editing is required for:

- wider arm pose range if current params are too limited
- new hand poses not reachable through current hand parameters
- stronger facial shape variety beyond current parameter range
- eyelid / lash / mouth corner deformations not exposed now
- entirely new expressions that need new deformers
- more dramatic torso/shoulder posing
- outfit-specific secondary motion improvements

### Missing expressive states that need rig work

If we want these at high quality, source editing is likely required:

- strong laugh
- embarrassed blush with richer face deformation
- pout
- teasing smirk with asymmetry
- sleepy
- dazed
- shocked wide-mouth reaction
- seductive look with stronger eyelid / mouth asymmetry
- richer hand gesture vocabulary

## Best Immediate Plan

### We should do now

1. Build a runtime motion preset system for:
   - idle
   - speaking
   - reaction
   - emotion transitions
2. Expand runtime expressions from existing brow/eye/mouth/cheek controls.
3. Improve the current speaking choreography so arms, head, eyes, and body feel coordinated rather than random.
4. Use Remotion as an authoring and preview environment for these presets if we want a real tuning workflow.

### We should request or author later

1. Author proper `.motion3.json` clips from `bezzly.cmo3`.
2. Add stronger expression deformations in Cubism Editor.
3. Expand hand and arm pose quality if current parameter range proves too shallow.

## Bottom Line

Aria is not blocked at the “only mouth movement” stage.

Right now we already have enough exposed rig controls to build much better:

- face motion
- gaze
- blink behavior
- speaking motion
- torso sway
- arm openness
- hand openness
- body drift
- emotion-specific movement presets

What we do not have yet is a proper authored motion library and deeper rig deformation range.

So:

- Better animation is possible now.
- Some genuinely new animation behaviors are possible now.
- The highest-end motion quality still improves further if we use the `cmo3` or involve the artist.

