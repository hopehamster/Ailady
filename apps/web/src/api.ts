// Authed API client (#42) — one choke point for every web → worker call so the
// Bearer token is attached and a 401 transparently refreshes + retries once.
//
// Bearer/dev-secret headers come from devHeaders() (which already reads the live
// session token in any build, or x-dev-secret in dev). On a 401 with a stored
// refresh token we hit /v1/auth/refresh, persist the ROTATED pair, and retry.
//
// SINGLE-FLIGHT: the worker rotates refresh tokens with reuse-revoke, so two
// concurrent 401s each presenting the same (now-consumed) refresh token would
// nuke the whole session. All concurrent refreshes share one in-flight promise.

import { loadSession, saveSession } from "./shell/auth/session";
import { devHeaders } from "./devAuth";

const REFRESH_PATH = "/v1/auth/refresh";

let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const s = loadSession();
  if (!s?.refreshToken) return false;
  try {
    const r = await fetch(REFRESH_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken: s.refreshToken }),
    });
    if (!r.ok) return false;
    const data = (await r.json().catch(() => null)) as {
      ok?: boolean;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
    } | null;
    if (data?.ok !== true || typeof data.accessToken !== "string" || !data.accessToken) return false;
    const cur = loadSession();
    if (!cur) return false; // signed out while in flight
    saveSession({
      ...cur,
      token: data.accessToken,
      refreshToken: typeof data.refreshToken === "string" ? data.refreshToken : cur.refreshToken,
      expiresAtMs: Date.now() + (typeof data.expiresIn === "number" ? data.expiresIn : 900) * 1000,
    });
    return true;
  } catch {
    return false;
  }
}

/** De-duped refresh: concurrent callers await the same rotation. */
function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/**
 * fetch() with auth headers + 401→refresh→retry-once. Drop-in for the raw
 * fetch calls to /api/*; callers keep their own content-type/body/signal.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const withAuth = (): RequestInit => ({
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), ...devHeaders() },
  });

  let res = await fetch(path, withAuth());
  if (res.status === 401 && loadSession()?.refreshToken) {
    const refreshed = await refreshOnce();
    if (refreshed) {
      res = await fetch(path, withAuth()); // devHeaders() re-reads the rotated token
    }
  }
  return res;
}
