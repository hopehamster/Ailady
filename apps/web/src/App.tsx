import { useState, lazy, Suspense, type ComponentType } from "react";
import { LiveAvatar } from "./LiveAvatar";
import { AriaTalkingView } from "./AriaTalkingView";

// Avatar character-maker (pick a preset face, no upload). Lazy + DEV-gated
// (import.meta.env.DEV) for now so the dev sample-avatar CDN URLs aren't in the prod
// bundle; un-gate once the avatars are self-hosted from R2 (security review 2026-06-22).
const CharacterMaker: ComponentType | null = import.meta.env.DEV
  ? lazy(() => import("./avatar/CharacterMaker").then((m) => ({ default: m.CharacterMaker })))
  : null;

export function App() {
  const [view, setView] = useState<"chat" | "avatar" | "avatar3d">("chat");

  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        padding: "1.5rem 1rem",
        fontFamily: "system-ui, sans-serif",
        color: "#e5e7eb",
      }}
    >
      <h1 style={{ color: "#C9A84C", fontWeight: 800 }}>Aria</h1>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => setView("chat")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #374151", background: view === "chat" ? "#C9A84C" : "#111827", color: view === "chat" ? "#111827" : "white", fontWeight: 600 }}>Chat</button>
        <button onClick={() => setView("avatar")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #374151", background: view === "avatar" ? "#C9A84C" : "#111827", color: view === "avatar" ? "#111827" : "white", fontWeight: 600 }}>Avatar (sandbox)</button>
        {import.meta.env.DEV && (
          <button onClick={() => setView("avatar3d")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #374151", background: view === "avatar3d" ? "#C9A84C" : "#111827", color: view === "avatar3d" ? "#111827" : "white", fontWeight: 600 }}>Create Aria</button>
        )}
      </div>

      {view === "chat" && <AriaTalkingView />}
      {view === "avatar" && <LiveAvatar />}
      {import.meta.env.DEV && CharacterMaker && view === "avatar3d" && (
        <Suspense fallback={null}>
          <CharacterMaker />
        </Suspense>
      )}
    </main>
  );
}
