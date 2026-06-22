import { useRef, useState } from "react";
import { AvatarStage } from "./AvatarStage";
import type { AvatarDriver } from "./AvatarDriver";

// Dev harness: proves the swappable AvatarDriver works inside the real React/Vite app —
// her face emotes from a psyche EmotionKey and her mouth lip-syncs. Sample Avaturn T2
// avatar; production swaps to our hand-built library (R2) + Cartesia audio.
// Pinned to an IMMUTABLE commit SHA (not @main) — supply-chain hardening (review
// 2026-06-22). This harness is DEV-only (lazy + import.meta.env.DEV gated in App.tsx),
// so this URL is not in the production bundle.
const SAMPLE_AVATAR =
  "https://cdn.jsdelivr.net/gh/met4citizen/TalkingHead@eed58d198076a7e1e825f804802921c4d3804d46/avatars/avaturn.glb";

// A representative spread of the 15 psyche EmotionKeys.
const EMOTIONS = [
  "neutral", "happy", "loving", "playful", "curious",
  "proud", "comforting", "sad", "concerned", "shy",
];

export function AvatarDemo() {
  const driverRef = useRef<AvatarDriver | null>(null);
  const [emotion, setEmotion] = useState("neutral");

  // Key-free lip-sync test: a silent buffer + fake word timings → visemes animate the
  // mouth (real audio comes from Cartesia later). Mirrors the de-risk spike.
  function testSpeak() {
    const driver = driverRef.current;
    const ctx = driver?.audioContext;
    if (!driver || !ctx) return;
    const words = ["hi", "there", "i'm", "right", "here", "with", "you"];
    const ms = 300;
    const buf = ctx.createBuffer(1, Math.ceil((ctx.sampleRate * words.length * ms) / 1000), ctx.sampleRate);
    void driver.speak({
      audio: buf,
      words,
      wtimes: words.map((_, i) => i * ms),
      wdurations: words.map(() => ms * 0.9),
    });
  }

  const btn = (active: boolean) => ({
    padding: "6px 10px",
    borderRadius: 8,
    border: "1px solid #374151",
    background: active ? "#C9A84C" : "#111827",
    color: active ? "#111827" : "white",
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ height: "60vh", borderRadius: 12, overflow: "hidden", border: "1px solid #1f2937" }}>
        <AvatarStage
          avatarUrl={SAMPLE_AVATAR}
          emotion={emotion}
          onReady={(d) => {
            driverRef.current = d;
          }}
        />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {EMOTIONS.map((e) => (
          <button key={e} onClick={() => setEmotion(e)} style={btn(emotion === e)}>
            {e}
          </button>
        ))}
        <button onClick={testSpeak} style={{ ...btn(false), background: "#1f2937" }}>
          ▶ speak (test)
        </button>
      </div>
      <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
        Dev harness — psyche emotion drives her face (TalkingHead, client-rendered). Prod swaps in
        our hand-built Avaturn library + Cartesia audio.
      </p>
    </div>
  );
}
