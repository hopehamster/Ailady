// Client-side session store (#19). One JSON blob in localStorage is the whole
// session truth: who the user is (`uid`), how they proved it (`mode`), and the
// Bearer token when the real phone-OTP flow issued one. Pure localStorage —
// NO import.meta.env here so tests (Node context) can import the key/shape.

export type AuthMode = "dev" | "otp";

export interface AuthSession {
  uid: string;
  mode: AuthMode;
  /** Bearer token from the real OTP verify endpoint. Absent for the dev-mock session. */
  token?: string;
  createdAtMs: number;
}

export const AUTH_SESSION_KEY = "aria.auth.session";

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<AuthSession>;
    if (typeof s.uid !== "string" || !s.uid) return null;
    if (s.mode !== "dev" && s.mode !== "otp") return null;
    if (s.token !== undefined && typeof s.token !== "string") return null;
    return {
      uid: s.uid,
      mode: s.mode,
      token: s.token,
      createdAtMs: typeof s.createdAtMs === "number" ? s.createdAtMs : 0,
    };
  } catch {
    return null; // corrupt/blocked storage = signed out, never a crash
  }
}

export function saveSession(session: AuthSession): void {
  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* private-mode storage failure: session lives for this page only */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

/** Bearer token for API calls, when the real OTP session issued one. */
export function sessionToken(): string | null {
  return loadSession()?.token ?? null;
}
