import { useState, type FormEvent } from "react";
import type { AuthSession } from "./auth/session";
import { getAuthAdapter } from "./auth/authService";
import { authFailureCopy } from "../errors/authErrors";

// Auth-gated entry (#19): phone entry → OTP entry → session. Talks only to the
// AuthAdapter (dev mock today; the real phone-OTP Bearer endpoints snap in at
// shell/auth/otpApiAdapter.ts). All failure copy is warm product copy
// (errors/authErrors.ts) — never a raw status.

type Step = "phone" | "code";

interface Props {
  onSignedIn: (session: AuthSession) => void;
}

export function SignIn({ onSignedIn }: Props) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adapter = getAuthAdapter();

  async function submitPhone(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await adapter.requestCode(phone);
    setPending(false);
    if (res.ok) {
      setCode("");
      setStep("code");
    } else {
      setError(authFailureCopy(res.error));
    }
  }

  async function submitCode(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await adapter.verifyCode(phone, code);
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
            <p className="signin-error" role="alert" data-aria-auth-error>
              {error}
            </p>
            <button className="btn btn-gold" type="submit" disabled={pending}>
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
