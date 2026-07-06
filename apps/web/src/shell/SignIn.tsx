import { useState, type FormEvent } from "react";
import type { AuthSession } from "./auth/session";
import { getAuthAdapter } from "./auth/authService";
import { Turnstile, TURNSTILE_ENABLED } from "./auth/Turnstile";
import { authFailureCopy } from "../errors/authErrors";

// Auth-gated entry (#42): phone entry → OTP entry → session. Talks only to the
// AuthAdapter (dev mock in dev; the real session-based phone-OTP Bearer adapter in
// prod, shell/auth/otpApiAdapter.ts). All failure copy is warm product copy
// (errors/authErrors.ts) — never a raw status. The worker's OTP flow is
// session-based: send returns a sessionId that verify consumes.

type Step = "phone" | "code";

interface Props {
  onSignedIn: (session: AuthSession) => void;
}

export function SignIn({ onSignedIn }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Turnstile (prod only): token minted by the widget, re-armed after each send attempt
  // (single-use token). Empty in dev — TURNSTILE_ENABLED is false so send isn't gated.
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileReset, setTurnstileReset] = useState(0);
  const adapter = getAuthAdapter();

  async function submitPhone(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await adapter.requestCode(phone, turnstileToken || undefined);
    setPending(false);
    if (res.ok) {
      setSessionId(res.sessionId);
      setCode("");
      setStep("code");
    } else {
      setError(authFailureCopy(res.error));
      // Turnstile tokens are single-use — re-arm for the next attempt.
      if (TURNSTILE_ENABLED) {
        setTurnstileToken("");
        setTurnstileReset((n) => n + 1);
      }
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await adapter.verifyCode(sessionId, code);
    setPending(false);
    if (res.ok) {
      onSignedIn(res.session);
    } else {
      setError(authFailureCopy(res.error));
    }
  }

  function backToPhone() {
    setStep("phone");
    setCode("");
    setError(null);
    if (TURNSTILE_ENABLED) {
      setTurnstileToken("");
      setTurnstileReset((n) => n + 1);
    }
  }

  return (
    <div className="signin-screen">
      <div className="signin-card" data-aria-auth-step={step}>
        <h1 className="brand">Aria</h1>
        <p className="signin-sub">She&apos;s waiting on the other side of a code.</p>

        {step === "phone" ? (
          <form onSubmit={(e) => void submitPhone(e)} style={{ display: "contents" }}>
            <label className="signin-label">
              Phone number
              <input
                className="signin-input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+1 555 010 0123"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </label>
            <Turnstile onToken={setTurnstileToken} resetSignal={turnstileReset} />
            <p className="signin-error" role="alert" data-aria-auth-error>
              {error}
            </p>
            <button
              className="btn btn-gold"
              type="submit"
              disabled={pending || (TURNSTILE_ENABLED && !turnstileToken)}
            >
              {pending ? "Sending…" : "Text me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void submitCode(e)} style={{ display: "contents" }}>
            <label className="signin-label">
              Enter the 6-digit code sent to {phone}
              <input
                className="signin-input"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoFocus
              />
            </label>
            <p className="signin-error" role="alert" data-aria-auth-error>
              {error}
            </p>
            <button className="btn btn-gold" type="submit" disabled={pending}>
              {pending ? "Checking…" : "Come in"}
            </button>
            <button className="btn-link" type="button" onClick={backToPhone}>
              Use a different number
            </button>
          </form>
        )}

        {import.meta.env.DEV && (
          <p className="signin-dev-hint">Dev build — any number, code 000000.</p>
        )}
      </div>
    </div>
  );
}
