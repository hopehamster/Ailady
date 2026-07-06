import { useEffect, useRef } from "react";

// Cloudflare Turnstile widget (#42). The worker's OTP /send fails closed without
// a valid turnstileToken outside dev, so this mints one on the phone step.
//
// PROD-ONLY by construction: renders nothing unless VITE_TURNSTILE_SITEKEY is set
// (absent in dev/e2e → the component is inert and SignIn sends no token, matching
// the worker's dev bypass). Managed mode auto-executes on render and calls onToken
// with a fresh token.
//
// SINGLE-USE: a Turnstile token is consumed by one siteverify and expires (~300s).
// The parent bumps `resetSignal` after each send attempt to re-execute the widget
// and mint a fresh token, so a retry never reuses a stale/consumed one.

const SITEKEY = import.meta.env.VITE_TURNSTILE_SITEKEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(el: HTMLElement, opts: {
    sitekey: string;
    callback: (token: string) => void;
    "error-callback"?: () => void;
    "expired-callback"?: () => void;
  }): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
  ready(cb: () => void): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("turnstile script load failed"));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

interface Props {
  onToken: (token: string) => void;
  /** Bump to re-execute the widget and mint a fresh token (single-use recovery). */
  resetSignal?: number;
}

/** True when a real sitekey is configured — SignIn uses this to gate the send button in prod. */
export const TURNSTILE_ENABLED = typeof SITEKEY === "string" && SITEKEY.length > 0;

export function Turnstile({ onToken, resetSignal = 0 }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  // Render the widget once the script + sitekey are ready.
  useEffect(() => {
    if (!TURNSTILE_ENABLED) return;
    let live = true;
    void loadScript()
      .then(() => {
        if (!live || !containerRef.current || !window.turnstile) return;
        window.turnstile.ready(() => {
          if (!live || !containerRef.current || !window.turnstile || widgetIdRef.current) return;
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: SITEKEY as string,
            callback: (token) => onTokenRef.current(token),
            "expired-callback": () => onTokenRef.current(""), // token aged out → clear it
          });
        });
      })
      .catch(() => {
        /* script blocked/offline — SignIn still shows the field; send will 403 and re-arm */
      });
    return () => {
      live = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
  }, []);

  // Re-arm on demand (single-use token recovery).
  useEffect(() => {
    if (resetSignal === 0) return;
    if (widgetIdRef.current && window.turnstile) {
      try {
        window.turnstile.reset(widgetIdRef.current);
      } catch {
        /* ignore */
      }
    }
  }, [resetSignal]);

  if (!TURNSTILE_ENABLED) return null;
  return <div ref={containerRef} style={{ marginTop: 4 }} />;
}
