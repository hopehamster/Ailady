import { useEffect, useRef, useState } from "react";
import type { AvatarDriver } from "./AvatarDriver";
import { TalkingHeadDriver } from "./TalkingHeadDriver";

interface AvatarStageProps {
  /** GLB url (dev: a sample; prod: our hand-built Avaturn T2 library in R2). */
  avatarUrl: string;
  /** Current psyche emotion → drives her face. */
  emotion?: string;
  /** Called when an avatar is loaded, with the live driver (for speak(), etc.). */
  onReady?: (driver: AvatarDriver) => void;
}

type Status = "loading" | "ready" | "error";

/** Renderer-agnostic avatar surface. Owns ONE driver for the component's lifetime;
 * switching `avatarUrl` re-loads the avatar on the same instance (no WebGL-context churn).
 * Swap TalkingHeadDriver for a cloud driver here without changing callers. */
export function AvatarStage({ avatarUrl, emotion, onReady }: AvatarStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<AvatarDriver | null>(null);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<Status>("loading");

  // Create + mount the driver ONCE. The `cancelled` guard makes React 18 StrictMode's
  // mount→unmount→mount safe.
  useEffect(() => {
    let cancelled = false;
    const driver = new TalkingHeadDriver();
    driverRef.current = driver;
    void (async () => {
      const el = containerRef.current;
      if (!el) return;
      try {
        await driver.mount(el);
        if (!cancelled) setMounted(true);
      } catch (err) {
        if (!cancelled) setStatus("error");
        console.error("AvatarStage.mount:", err);
      }
    })();
    return () => {
      cancelled = true;
      setMounted(false);
      driver.dispose();
      driverRef.current = null;
    };
  }, []);

  // (Re)load the avatar whenever the url changes — on the same driver instance.
  useEffect(() => {
    if (!mounted) return;
    const driver = driverRef.current;
    if (!driver) return;
    let cancelled = false;
    setStatus("loading");
    void (async () => {
      try {
        await driver.loadAvatar(avatarUrl);
        if (cancelled) return;
        setStatus("ready");
        onReady?.(driver);
      } catch (err) {
        if (!cancelled) setStatus("error");
        console.error("AvatarStage.loadAvatar:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // onReady intentionally omitted — a new callback identity must not reload the avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl, mounted]);

  // Push emotion changes to the face once ready.
  useEffect(() => {
    if (status === "ready" && emotion) driverRef.current?.setEmotion(emotion);
  }, [emotion, status]);

  // Pause the render loop when the tab is hidden.
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
