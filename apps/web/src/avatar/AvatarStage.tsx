import { useCallback, useEffect, useRef, useState } from "react";
import type { AvatarDriver } from "./AvatarDriver";
import { TalkingHeadDriver } from "./TalkingHeadDriver";

interface AvatarStageProps {
  /** GLB url (dev: a sample; prod: our hand-built Avaturn T2 library in R2). */
  avatarUrl: string;
  /** Current psyche emotion → drives her face. */
  emotion?: string;
  /** Psyche emotion intensity 0..1 — bands the body plan (subtle/present/strong). */
  emotionIntensity?: number;
  /** Called when an avatar is loaded, with the live driver (for speak(), etc.). */
  onReady?: (driver: AvatarDriver) => void;
  /** Product-error hook (#20): fires on mount/load failure with a phase tag, so
   * the shell can show a product-quality state instead of a raw console error. */
  onError?: (phase: "mount" | "load", error: unknown) => void;
}

type Status = "loading" | "ready" | "error";

/** Renderer-agnostic avatar surface. Owns ONE driver for the component's lifetime;
 * switching `avatarUrl` re-loads the avatar on the same instance (no WebGL-context churn).
 * Swap TalkingHeadDriver for a cloud driver here without changing callers. */
export function AvatarStage({ avatarUrl, emotion, emotionIntensity, onReady, onError }: AvatarStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const driverRef = useRef<AvatarDriver | null>(null);
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  // Bump to re-run the load effect (user-invoked retry after a failure).
  const [loadAttempt, setLoadAttempt] = useState(0);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
        if (!cancelled) {
          setStatus("error");
          onErrorRef.current?.("mount", err);
        }
        // Handled + surfaced (status=error → fallback UI + retry) — warn, not error
        // (#24 precedent: a caught, user-recovered fault isn't a crash).
        console.warn("AvatarStage.mount:", err);
      }
    })();
    return () => {
      cancelled = true;
      setMounted(false);
      driver.dispose();
      driverRef.current = null;
    };
  }, []);

  // (Re)load the avatar whenever the url changes (or a retry is requested) — on
  // the same driver instance.
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
        // Ensure the render loop is running after load — the visibilitychange handler
        // only toggles it on later tab show/hide, so without this the canvas can stay
        // blank until the first visibility change. start() is idempotent.
        driver.start();
        onReady?.(driver);
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          onErrorRef.current?.("load", err);
        }
        // Handled + surfaced (fallback UI + retry) — warn, not error (#24 precedent).
        console.warn("AvatarStage.loadAvatar:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // onReady intentionally omitted — a new callback identity must not reload the avatar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarUrl, mounted, loadAttempt]);

  // Push emotion changes to the face once ready (intensity bands the body plan).
  useEffect(() => {
    if (status === "ready" && emotion) driverRef.current?.setEmotion(emotion, emotionIntensity);
  }, [emotion, emotionIntensity, status]);

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

  // WebGL context loss (#20): GPU resets / driver crashes fire `webglcontextlost`
  // on the canvas. Recover by re-running the load pass instead of freezing on a
  // dead canvas. `webglcontextrestored` alone isn't enough for TalkingHead (its
  // GPU resources are gone) — a full avatar reload is the reliable path.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !mounted) return;
    const onLost = (e: Event) => {
      e.preventDefault(); // allow restoration
      console.warn("AvatarStage: WebGL context lost — reloading avatar");
      setLoadAttempt((n) => n + 1);
    };
    // The canvas is created by TalkingHead inside our container; listen at the
    // container so we don't depend on when the canvas appears.
    el.addEventListener("webglcontextlost", onLost, true);
    return () => el.removeEventListener("webglcontextlost", onLost, true);
  }, [mounted]);

  const retry = useCallback(() => setLoadAttempt((n) => n + 1), []);

  return (
    <div
      data-aria-avatar-status={status}
      style={{ position: "relative", width: "100%", height: "100%", background: "#0A1628" }}
    >
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      {status === "loading" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#9fb2c8",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            gap: 10,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 14,
              height: 14,
              border: "2px solid #22344d",
              borderTopColor: "#9fb2c8",
              borderRadius: "50%",
              animation: "aria-avatar-spin 0.9s linear infinite",
            }}
          />
          waking her up…
          <style>{"@keyframes aria-avatar-spin { to { transform: rotate(360deg); } }"}</style>
        </div>
      )}
      {status === "error" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#9fb2c8",
            fontFamily: "system-ui, sans-serif",
            fontSize: 14,
            gap: 12,
            textAlign: "center",
            padding: 16,
          }}
        >
          <div>She couldn&apos;t appear right now — the connection to her look failed.</div>
          <button
            onClick={retry}
            style={{
              background: "#1f2937",
              color: "#e5e7eb",
              border: "1px solid #374151",
              borderRadius: 8,
              padding: "6px 16px",
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
