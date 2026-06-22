import { useEffect, useRef, useState } from "react";
import type { AvatarDriver } from "./AvatarDriver";
import { TalkingHeadDriver } from "./TalkingHeadDriver";

interface AvatarStageProps {
  /** GLB url (dev: a sample; prod: our hand-built Avaturn T2 library in R2). */
  avatarUrl: string;
  /** Current psyche emotion → drives her face. */
  emotion?: string;
  /** Called once the avatar is loaded, with the live driver (for speak(), etc.). */
  onReady?: (driver: AvatarDriver) => void;
}

type Status = "loading" | "ready" | "error";

/** Renderer-agnostic avatar surface. Owns the driver lifecycle; swap TalkingHeadDriver
 * for a cloud driver here without changing callers. */
export function AvatarStage({ avatarUrl, emotion, onReady }: AvatarStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<AvatarDriver | null>(null);
  const [status, setStatus] = useState<Status>("loading");

  // Mount + load the avatar. Re-runs only if the avatar url changes. The `cancelled`
  // guard makes React 18 StrictMode's mount→unmount→mount safe (dispose tears down).
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    const driver = new TalkingHeadDriver();
    driverRef.current = driver;

    void (async () => {
      try {
        const el = containerRef.current;
        if (!el) return;
        await driver.mount(el);
        await driver.loadAvatar(avatarUrl);
        if (cancelled) {
          driver.dispose();
          return;
        }
        setStatus("ready");
        onReady?.(driver);
      } catch (err) {
        if (!cancelled) setStatus("error");
        console.error("AvatarStage:", err);
      }
    })();

    return () => {
      cancelled = true;
      driver.dispose();
      driverRef.current = null;
    };
    // onReady intentionally omitted: a new callback identity must not reload the avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl]);

  // Push emotion changes to the face once ready.
  useEffect(() => {
    if (status === "ready" && emotion) driverRef.current?.setEmotion(emotion);
  }, [emotion, status]);

  // Pause the render loop when the tab is hidden (saves battery/GPU).
  useEffect(() => {
    const onVis = () => {
      const d = driverRef.current;
      if (!d) return;
      document.visibilityState === "visible" ? d.start() : d.stop();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#0A1628" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {status !== "ready" && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            color: status === "error" ? "#f87171" : "#9fb2c8",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
          }}
        >
          {status === "error" ? "avatar failed to load" : "loading avatar…"}
        </div>
      )}
    </div>
  );
}
