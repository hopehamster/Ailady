# Avatar render de-risk (Phase 2 body)

Proves the locked avatar path works end-to-end in a browser, key-free and ~$0/min:
**Avaturn T2 GLB → TalkingHead.js (Three.js, client-rendered)**, with the psyche's
emotion driving the face and lip-sync from audio+visemes.

## Verified (2026-06-22, headless WebGL via cloakbrowser)
1. An **Avaturn** sample GLB (`avatars/avaturn.glb` from met4citizen/TalkingHead) loads + renders.
2. **Emotion on the face** — `setMood` maps a psyche EmotionKey → TalkingHead mood; neutral/happy/sad are visibly distinct.
3. **Lip-sync** — `speakAudio` animates the mouth from word/viseme timing; mood persists during speech.

## Run
```
python -m http.server 8899 --bind 127.0.0.1   # in this dir
# open http://127.0.0.1:8899/  (or: node ~/.claude/tools/cloakbrowser/shot-avatar.mjs)
```
`avaturn.glb` is a re-downloadable third-party sample (gitignored): 
`curl -L -o avaturn.glb https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@main/avatars/avaturn.glb`

## Next (Phase 2 build)
- Lift this into a swappable `AvatarDriver` interface in `apps/web` (TalkingHeadDriver primary; Tavus/HeyGen behind the same interface).
- Replace the sample GLB with our hand-built Avaturn T2 library (preset AI-gen faces, no user upload) in R2.
- Wire real lip-sync audio from Cartesia TTS; map the full 15 psyche EmotionKeys → moods.
- The one upstream gotcha: the bundled avatars live on `@main`, not the `@1.7` tag; pin/host our own GLBs.
