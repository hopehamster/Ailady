# Live2D Animation Upgrade Brief (Aria)

## Context
Current Aria runtime supports:
- voice lip-sync,
- base emotions (`Happy`, `Sad`, `Angry`, `Neutral`),
- procedural idle (blink, eye look, breath, head/body/arm micro-movement).

This is a good baseline, but the reference examples show a higher animation tier that needs authored rig/motion work in Cubism.

## What We Observed in the References
- Motion is layered, not single-loop: face + torso + arms + hair + cloth move together.
- Characters shift pose silhouette often (roughly every 1-3 seconds), even while idle.
- Eye behavior is nuanced: blinks vary in timing/shape, with occasional double-blinks and gaze shifts.
- Speaking feels alive because head/torso/arm timing follows voice rhythm, not just mouth-open.
- Secondary motion (hair/cloth/chest/accessories) is tuned and synchronized with body movement.

## What We Need From Artist for Full Animation Quality

### 1) Source + Runtime Package
- `Aria.cmo3` (latest source file, required).
- Final runtime export (`.moc3`, `.model3.json`, textures, physics, expressions, motions).
- Keep a stable package folder structure for app integration.

### 2) Parameter Cleanup and Naming
- Replace ambiguous custom IDs (`Param28`, `Param29`, etc.) with meaningful IDs where possible.
- Provide a parameter map document:
  - `ID`
  - human meaning
  - min/max/default
  - recommended runtime safe range.
- If renaming breaks compatibility, provide explicit old->new mapping.

### 3) Facial Expression Set (Authoring Needed)
Please deliver authored `.exp3.json` expressions for:
- `NeutralSoft`
- `HappySoft`
- `HappyBig`
- `SadSoft`
- `SadDeep`
- `AngrySoft`
- `AngryStrong`
- `Surprised`
- `Shy`
- `Flirty`
- `Thinking`
- `Comforting`
- `Sleepy`
- `WinkLeft`
- `WinkRight`

Goal: expression changes should visibly affect brows/eyes/mouth/cheeks without distortion.

### 4) Authored Motion Set (Main Gap)
Please deliver `.motion3.json` clips with clean loops and transitions:

Idle loops:
- `Idle_Listen_A`
- `Idle_Listen_B`
- `Idle_Breath_Soft`
- `Idle_GazeShift`
- `Idle_ShiftWeight`

Speaking loops:
- `Talk_Neutral_Soft`
- `Talk_Engaged`
- `Talk_Happy`
- `Talk_Sad`
- `Talk_Angry`

Reaction one-shots:
- `React_Nod`
- `React_HeadTilt`
- `React_SmileIn`
- `React_Surprised`
- `React_ShyLookAway`

### 5) Eye/Blink Polish
- Dedicated blink behavior tuned per expression (neutral/happy/sad/angry).
- Optional asymmetry and occasional double-blink behavior.
- Natural eyelid arc and timing (no robotic open/close).

### 6) Secondary Motion and Physics
- Tune physics for:
  - front/side/back hair,
  - cloth and chest sway,
  - accessories (if present).
- Avoid over-bounce; motion should be subtle and premium.

### 7) Mobile-Ready Performance
- Keep 8K master, but provide mobile-optimized texture export option if possible.
- Ensure motions/expressions look smooth at mobile frame rates.
- No popping/jitter during repeated transitions.

## Technical Delivery Checklist (Artist)
- [ ] `cmo3` source included
- [ ] complete export package included
- [ ] expression pack delivered
- [ ] motion pack delivered
- [ ] physics tuned
- [ ] parameter map with ranges delivered
- [ ] naming/mapping compatibility notes delivered

## Plain Message You Can Send to the Artist
Hi! We have Aria running in-app now, but to reach premium-quality animation we need authored Cubism motion and expression polish from you.

Please send:
1. Latest `cmo3` source file.
2. Full export package (`moc3`, `model3.json`, textures, physics, expressions, motions).
3. Expression set: `NeutralSoft`, `HappySoft`, `HappyBig`, `SadSoft`, `SadDeep`, `AngrySoft`, `AngryStrong`, `Surprised`, `Shy`, `Flirty`, `Thinking`, `Comforting`, `Sleepy`, `WinkLeft`, `WinkRight`.
4. Motion set:
   - Idle loops: `Idle_Listen_A`, `Idle_Listen_B`, `Idle_Breath_Soft`, `Idle_GazeShift`, `Idle_ShiftWeight`
   - Speaking loops: `Talk_Neutral_Soft`, `Talk_Engaged`, `Talk_Happy`, `Talk_Sad`, `Talk_Angry`
   - Reactions: `React_Nod`, `React_HeadTilt`, `React_SmileIn`, `React_Surprised`, `React_ShyLookAway`
5. Parameter map sheet: ID, meaning, min/max/default, safe runtime range.
6. If any parameter IDs are renamed, include old->new mapping.

Target style: natural, premium, subtle layered movement (face + torso + arms + hair/cloth), with clean loops and smooth transitions.
