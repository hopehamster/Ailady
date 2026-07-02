import type { Page } from "@playwright/test";

// Session-seeding helper (#19). The shell is auth-gated; every spec that isn't
// ABOUT the gate seeds a dev session before navigation so it lands straight in
// the chat. Key + shape mirror apps/web/src/shell/auth/session.ts.

export const AUTH_SESSION_KEY = "aria.auth.session";

/** The code the DEV mock adapter accepts (src/shell/auth/devMockAdapter.ts). */
export const DEV_OTP_CODE = "000000";

const DEV_SESSION_JSON = JSON.stringify({ uid: "dev-user", mode: "dev", createdAtMs: 0 });

/** Install BEFORE goto(): seeds the dev session on every navigation. */
export async function seedDevSession(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* ignore */
      }
    },
    [AUTH_SESSION_KEY, DEV_SESSION_JSON] as const,
  );
}
