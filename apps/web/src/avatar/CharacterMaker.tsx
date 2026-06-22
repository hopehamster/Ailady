import { useEffect, useRef, useState } from "react";
import { AvatarStage } from "./AvatarStage";
import type { AvatarDriver } from "./AvatarDriver";
import { loadAvatarLibrary, type AvatarPreset } from "./avatarLibrary";

// "Create Aria" — pick a face from the preset library (no upload), preview it live, and
// see the psyche's emotion on it. The chosen face persists. This is the user-facing
// character-maker; in dev it runs over the placeholder gallery, in prod over our R2 library.

const EMOTIONS = [
  "neutral", "happy", "loving", "playful", "curious",
  "proud", "comforting", "sad", "concerned", "shy",
];
const LS_KEY = "aria.avatar.preset";

export function CharacterMaker() {
  const [presets, setPresets] = useState<AvatarPreset[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [emotion, setEmotion] = useState("neutral");
  const driverRef = useRef<AvatarDriver | null>(null);

  useEffect(() => {
    let live = true;
    void loadAvatarLibrary().then((list) => {
      if (!live) return;
      setPresets(list);
      const saved = localStorage.getItem(LS_KEY);
      const initial = saved && list.some((p) => p.id === saved) ? saved : list[0]?.id ?? "";
      setSelectedId(initial);
    });
    return () => {
      live = false;
    };
  }, []);

  const selected = presets.find((p) => p.id === selectedId) ?? null;

  function pick(id: string) {
    setSelectedId(id);
    localStorage.setItem(LS_KEY, id);
  }

  // Key-free lip-sync preview (real audio = Cartesia later).
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

  const chip = (active: boolean) => ({
    padding: "6px 12px",
    borderRadius: 8,
    border: active ? "1px solid #C9A84C" : "1px solid #374151",
    background: active ? "#C9A84C" : "#111827",
    color: active ? "#111827" : "white",
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ height: "52vh", borderRadius: 12, overflow: "hidden", border: "1px solid #1f2937" }}>
        {selected ? (
          <AvatarStage
            avatarUrl={selected.glbUrl}
            emotion={emotion}
            onReady={(d) => {
              driverRef.current = d;
            }}
          />
        ) : (
          <div style={{ color: "#9fb2c8", padding: 16 }}>loading library…</div>
        )}
      </div>

      <div>
        <div style={{ color: "#C9A84C", fontWeight: 700, marginBottom: 6 }}>Choose her face</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {presets.map((p) => (
            <button key={p.id} onClick={() => pick(p.id)} style={chip(p.id === selectedId)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div style={{ color: "#9fb2c8", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Emotion (psyche → face)</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {EMOTIONS.map((e) => (
            <button key={e} onClick={() => setEmotion(e)} style={chip(emotion === e)}>
              {e}
            </button>
          ))}
          <button onClick={testSpeak} style={{ ...chip(false), background: "#1f2937" }}>
            ▶ speak (test)
          </button>
        </div>
      </div>

      <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
        Preset faces only — no photo upload (consent-safe by design). Dev gallery uses sample
        avatars; prod loads our hand-built Avaturn T2 library from R2.
      </p>
    </div>
  );
}
