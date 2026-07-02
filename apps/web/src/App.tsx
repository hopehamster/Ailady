import { useState } from "react";
import type { AuthSession } from "./shell/auth/session";
import { loadSession, saveSession, clearSession } from "./shell/auth/session";
import { SignIn } from "./shell/SignIn";
import { AppShell } from "./shell/AppShell";

// Session boundary (#19): no session → the sign-in gate (phone → OTP);
// session → the product shell. Session restore is synchronous (localStorage),
// so a returning user never sees the gate flash.

export function App() {
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());

  if (!session) {
    return (
      <SignIn
        onSignedIn={(s) => {
          saveSession(s);
          setSession(s);
        }}
      />
    );
  }

  return (
    <AppShell
      onSignOut={() => {
        clearSession();
        setSession(null);
      }}
    />
  );
}
