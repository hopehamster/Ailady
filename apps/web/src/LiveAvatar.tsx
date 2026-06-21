import { useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteTrack } from "livekit-client";

interface SessionResp {
  success: boolean;
  session_id?: string;
  livekit_url?: string;
  livekit_client_token?: string;
  ws_url?: string;
  max_session_duration?: number;
  error?: string;
  detail?: unknown;
}

/**
 * Generate ~2s of speech-like PCM (16-bit signed LE, 24 kHz, mono) as base64.
 * A 180 Hz carrier amplitude-modulated at ~4 Hz (syllable cadence) so the
 * avatar's prosody-driven mouth animates. Phase 2 replaces this with Cartesia TTS.
 */
function makeTestPcmBase64(): string {
  const sr = 24000;
  const dur = 2.0;
  const n = Math.floor(sr * dur);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const carrier = Math.sin(2 * Math.PI * 180 * t);
    const env = 0.5 * (1 - Math.cos(2 * Math.PI * 4 * t)); // 0..1 syllable-rate
    const fade = Math.min(1, t / 0.05, (dur - t) / 0.05);
    pcm[i] = Math.round(carrier * env * fade * 12000);
  }
  const bytes = new Uint8Array(pcm.buffer);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function looksConnected(msg: Record<string, unknown>): boolean {
  const state =
    (msg.state as string) ??
    ((msg.data as Record<string, unknown> | undefined)?.state as string) ??
    "";
  return msg.type === "session.state_updated" && state === "connected";
}

export function LiveAvatar() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [faceDropped, setFaceDropped] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const note = (m: string) => setLog((l) => [...l.slice(-12), m]);

  async function start() {
    if (busy) return;
    setBusy(true);
    setFaceDropped(false);
    try {
      setStatus("minting LITE sandbox session…");
      const r = await fetch("/api/avatar/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const s = (await r.json()) as SessionResp;
      if (!s.success || !s.livekit_url || !s.livekit_client_token) {
        setStatus(`session error: ${s.error ?? "unknown"}`);
        note(JSON.stringify(s).slice(0, 300));
        setBusy(false);
        return;
      }
      note(`session ${s.session_id?.slice(0, 8)}… max ${s.max_session_duration}s`);

      // 1) Join the LiveKit room as VIEWER and render the avatar's tracks.
      const room = new Room();
      roomRef.current = room;
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video && videoRef.current) {
          track.attach(videoRef.current);
          setFaceDropped(false);
          note("video track attached");
        }
        if (track.kind === Track.Kind.Audio && audioRef.current) {
          track.attach(audioRef.current);
          note("audio track attached");
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        // Face-drop fallback: if the video stream drops, audio keeps going — a
        // media-call degradation like any webcam, NOT an error screen.
        if (track.kind === Track.Kind.Video) {
          setFaceDropped(true);
          note("video dropped — audio continues (fallback)");
        }
      });
      room.on(RoomEvent.Disconnected, () => setStatus("room disconnected"));

      setStatus("joining LiveKit room…");
      await room.connect(s.livekit_url, s.livekit_client_token);
      setStatus("joined — opening control WS…");

      // 2) Connect the LITE control WebSocket; speak a test clip once connected.
      if (!s.ws_url) {
        setStatus("joined, but no ws_url (cannot speak)");
        setBusy(false);
        return;
      }
      const ws = new WebSocket(s.ws_url);
      wsRef.current = ws;
      ws.onopen = () => {
        setStatus("WS open — waiting for connected…");
        note("ws open");
      };
      ws.onmessage = (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data as string);
        } catch {
          return;
        }
        if (typeof msg.type === "string") note(`ws: ${msg.type}`);
        if (looksConnected(msg)) {
          setStatus("connected — speaking test clip…");
          ws.send(JSON.stringify({ type: "agent.start_listening", event_id: crypto.randomUUID() }));
          ws.send(JSON.stringify({ type: "agent.speak", audio: makeTestPcmBase64() }));
          ws.send(JSON.stringify({ type: "agent.speak_end", event_id: crypto.randomUUID() }));
        }
        if (msg.type === "agent.speak_started") setStatus("avatar speaking ▶");
        if (msg.type === "agent.speak_ended") setStatus("done — the face spoke ✓");
      };
      ws.onerror = () => {
        setStatus("WS error (check console)");
        note("ws error");
      };
      ws.onclose = () => note("ws closed");
    } catch (e) {
      setStatus(`error: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    roomRef.current?.disconnect();
    wsRef.current?.close();
    roomRef.current = null;
    wsRef.current = null;
    setStatus("stopped");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ position: "relative", aspectRatio: "16 / 9", background: "#0b1220", borderRadius: 12, overflow: "hidden", border: "1px solid #1f2937" }}>
        <video ref={videoRef} autoPlay playsInline muted={false} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
        <audio ref={audioRef} autoPlay />
        {faceDropped && (
          <div style={{ position: "absolute", top: 8, left: 8, background: "rgba(0,0,0,0.6)", color: "#fbbf24", padding: "4px 8px", borderRadius: 6, fontSize: 12 }}>
            video paused — audio continues
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => void start()} disabled={busy} style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#C9A84C", fontWeight: 700 }}>
          {busy ? "…" : "Start avatar (sandbox)"}
        </button>
        <button onClick={stop} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #374151", background: "#111827", color: "white" }}>
          Stop
        </button>
        <span style={{ color: "#9ca3af", fontSize: 13 }}>{status}</span>
      </div>
      <pre style={{ margin: 0, fontSize: 11, color: "#6b7280", background: "#0b1220", padding: 8, borderRadius: 8, maxHeight: 160, overflow: "auto" }}>
        {log.join("\n")}
      </pre>
    </div>
  );
}
