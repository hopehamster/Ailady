import { useState, lazy, Suspense, type ComponentType } from "react";
import type { ChatRequest, ChatResponse } from "@aria/shared-types";
import { LiveAvatar } from "./LiveAvatar";

// Dev-only avatar harness — lazy + DEV-gated (import.meta.env.DEV) so it's code-split
// and its sample-avatar CDN URL is not reachable from a production bundle (review 2026-06-22).
const AvatarDemo: ComponentType | null = import.meta.env.DEV
  ? lazy(() => import("./avatar/AvatarDemo").then((m) => ({ default: m.AvatarDemo })))
  : null;

interface Msg {
  who: "you" | "aria";
  text: string;
}

export function App() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"chat" | "avatar" | "avatar3d">("chat");

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMsgs((m) => [...m, { who: "you", text }]);
    setBusy(true);
    try {
      const req: ChatRequest = {
        message: text,
        clientTime: {
          clientEpochMs: Date.now(),
          timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
          timeZoneName: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      const data = (await r.json()) as ChatResponse;
      setMsgs((m) => [...m, { who: "aria", text: data.response ?? "(no reply)" }]);
    } catch (e) {
      setMsgs((m) => [...m, { who: "aria", text: `(error: ${String(e)})` }]);
    } finally {
      setBusy(false);
    }
  }

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
          <button onClick={() => setView("avatar3d")} style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid #374151", background: view === "avatar3d" ? "#C9A84C" : "#111827", color: view === "avatar3d" ? "#111827" : "white", fontWeight: 600 }}>Avatar (3D)</button>
        )}
      </div>
      {view === "avatar" && <LiveAvatar />}
      {import.meta.env.DEV && AvatarDemo && view === "avatar3d" && (
        <Suspense fallback={null}>
          <AvatarDemo />
        </Suspense>
      )}
      {view === "chat" && (
        <>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.who === "you" ? "flex-end" : "flex-start",
              background: m.who === "you" ? "#2563eb" : "#1f2937",
              color: "white",
              padding: "8px 12px",
              borderRadius: 12,
              maxWidth: "80%",
              whiteSpace: "pre-wrap",
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder="Say something to Aria…"
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 8,
            border: "1px solid #374151",
            background: "#111827",
            color: "white",
          }}
        />
        <button
          onClick={() => void send()}
          disabled={busy}
          style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#C9A84C", fontWeight: 700 }}
        >
          {busy ? "…" : "Send"}
        </button>
      </div>
        </>
      )}
    </main>
  );
}
