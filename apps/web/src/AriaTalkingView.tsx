import { useEffect, useRef, useState } from "react";
import type { ChatRequest, ChatResponse } from "@aria/shared-types";
import { AvatarStage } from "./avatar/AvatarStage";
import type { AvatarDriver } from "./avatar/AvatarDriver";
import { loadAvatarLibrary } from "./avatar/avatarLibrary";
import { synthesizeSpeech } from "./avatar/speech";
import { devHeaders } from "./devAuth";
import { chatHttpFailure, chatThrownFailure } from "./errors/chatErrors";

// The talking loop: type to Aria → her rendered face shows the reply's emotion → her
// mouth lip-syncs the reply. The avatar is driven IMPERATIVELY through the driver ref
// (set in AvatarStage's onReady) — we never pass a per-message `emotion` prop, so the
// chat's per-message re-renders never churn the WebGL context.
//
// The avatar is shown in DEV only (the sample GLB urls in avatarLibrary are dev-only
// until the R2 swap); in prod this is chat-only and the loop degrades to text — same as
// before. Real voice arrives when CARTESIA_API_KEY is set (Slice B); until then the
// mouth moves silently via the proven stub.

interface Msg {
  who: "you" | "aria";
  text: string;
}

const LS_KEY = "aria.avatar.preset";
const SHOW_AVATAR = import.meta.env.DEV;

export function AriaTalkingView() {
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [glbUrl, setGlbUrl] = useState<string | null>(null);
  // Test hook: reflects the last reply's emotion in the DOM (head.setMood is otherwise
  // DOM-invisible). Set UNCONDITIONALLY on reply so the emote assertion is independent of
  // whether the avatar GLB loaded. Read via [data-aria-emotion].
  const [lastEmotion, setLastEmotion] = useState<string>("neutral");
  const [lastIntensity, setLastIntensity] = useState<number>(0.2);
  // #24 retry affordance: the last user text that failed to send, so the UI can offer "Try again".
  const [retryText, setRetryText] = useState<string | null>(null);
  const driverRef = useRef<AvatarDriver | null>(null);

  // Load the chosen face — the same preset "Create Aria" persists, so the face carries over.
  useEffect(() => {
    if (!SHOW_AVATAR) return;
    let live = true;
    void loadAvatarLibrary().then((list) => {
      if (!live) return;
      const saved = localStorage.getItem(LS_KEY);
      const chosen = (saved ? list.find((p) => p.id === saved) : undefined) ?? list[0];
      setGlbUrl(chosen?.glbUrl ?? null);
    });
    return () => {
      live = false;
    };
  }, []);

  async function send(retry?: string) {
    const text = (retry ?? input).trim();
    if (!text || busy) return;
    // Fresh send: clear the box + show the user's bubble. Retry: the bubble is already
    // there, so we just re-attempt the same text.
    if (!retry) {
      setInput("");
      setMsgs((m) => [...m, { who: "you", text }]);
    }
    setRetryText(null);
    setBusy(true);

    // Resume the AudioContext INSIDE the user gesture (browser autoplay policy).
    // Null-guarded: head.audioCtx exists only once the GLB has loaded; if a message is
    // sent before that, the stub still animates the mouth on the render clock.
    const gestureDriver = driverRef.current;
    if (gestureDriver?.audioContext?.state === "suspended") {
      void gestureDriver.audioContext.resume();
    }

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
        headers: { "content-type": "application/json", ...devHeaders() },
        body: JSON.stringify(req),
        // #24 slow-request state: a stalled request aborts → chatThrownFailure() network copy.
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await r.json().catch(() => null)) as ChatResponse | null;
      if (!r.ok || !data || data.success === false) {
        const failure = chatHttpFailure(r.status, r.headers.get("retry-after"));
        setMsgs((m) => [...m, { who: "aria", text: failure.message }]);
        // Auth/banned aren't retryable in place (session gone / conversation closed); the rest are.
        if (failure.kind !== "auth" && failure.kind !== "banned") setRetryText(text);
        return;
      }

      const reply = data.response ?? "(no reply)";
      setMsgs((m) => [...m, { who: "aria", text: reply }]);
      setLastEmotion(data.emotion ?? "neutral"); // test hook — independent of avatar load
      setLastIntensity(
        typeof data.emotionIntensity === "number" ? data.emotionIntensity : 0.2,
      );

      // Mind ↔ body: set the sustained mood first (persists during speech), then speak.
      const driver = driverRef.current;
      if (driver) {
        driver.setEmotion(data.emotion, data.emotionIntensity);
        // Defensive: resume right before speak too (not only at gesture start) — the avatar
        // may have loaded after the gesture, leaving the context suspended.
        if (driver.audioContext?.state === "suspended") void driver.audioContext.resume();
        try {
          const timed = await synthesizeSpeech(reply, driver);
          if (timed) await driver.speak(timed);
        } catch (ttsErr) {
          // Voice failing must never break the text loop — she just goes quiet.
          console.warn("tts/speak failed:", ttsErr);
        }
      }
    } catch (e) {
      // Handled + surfaced to the user (warm copy + retry) — a warning, not an error, so it
      // doesn't read as a crash (mirrors the TTS catch). The jsErrors test fixture treats
      // console.error as a failure; a caught, user-recovered network fault isn't one.
      console.warn("chat send failed:", e);
      setMsgs((m) => [...m, { who: "aria", text: chatThrownFailure(e).message }]);
      setRetryText(text); // network/timeout/abort — offer a retry
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {SHOW_AVATAR && glbUrl && (
        <div
          style={{
            height: "40vh",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid #1f2937",
            marginBottom: 12,
          }}
        >
          <AvatarStage
            avatarUrl={glbUrl}
            onReady={(d) => {
              driverRef.current = d;
            }}
          />
        </div>
      )}

      <div data-aria-emotion={lastEmotion} data-aria-intensity={lastIntensity} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
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

      {retryText && !busy && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => void send(retryText)}
            data-testid="retry-send"
            style={{
              padding: "6px 14px",
              borderRadius: 8,
              border: "1px solid #C9A84C",
              background: "transparent",
              color: "#C9A84C",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            ↻ Try again
          </button>
        </div>
      )}

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
  );
}
