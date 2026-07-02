// Product-quality error copy (#24). Every failure a user can hit in the talking
// loop maps to warm, in-world copy — never a raw status code, stack trace, or
// server error body. Pure + unit-testable: the view hands us what it knows
// (an HTTP response shape or a thrown error) and renders the returned copy.
//
// Copy voice: Aria is an intimate companion — failures read as HER having
// trouble reaching him, not as a system fault report. Short, calm, actionable.

export interface ChatFailure {
  /** What the bubble says (spoken in Aria's world, not the system's). */
  message: string;
  /** Machine-readable kind for tests/telemetry. */
  kind:
    | "rate-limited"
    | "banned"
    | "auth"
    | "network"
    | "server"
    | "tts"
    | "avatar"
    | "unknown";
  /** Seconds until retry is sensible (from retry-after when present). */
  retryAfterSec?: number;
}

/** Map a non-ok /api/chat HTTP response to product copy. */
export function chatHttpFailure(status: number, retryAfterHeader?: string | null): ChatFailure {
  if (status === 429) {
    const parsed = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
    const retryAfterSec = Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
    return {
      kind: "rate-limited",
      retryAfterSec,
      message: retryAfterSec
        ? `Easy, tiger — give me ${retryAfterSec} seconds to catch my breath.`
        : "Easy, tiger — give me a few seconds to catch my breath.",
    };
  }
  if (status === 403) {
    return {
      kind: "banned",
      message: "This conversation isn't available right now.",
    };
  }
  if (status === 401) {
    return {
      kind: "auth",
      message: "I don't recognize this session anymore — sign in again and come find me.",
    };
  }
  if (status >= 500) {
    return {
      kind: "server",
      message: "Something hiccuped on my side. Say that again for me?",
    };
  }
  return {
    kind: "unknown",
    message: "That didn't get through to me. Try once more?",
  };
}

/** Map a thrown error (fetch/network/abort) to product copy. */
export function chatThrownFailure(err: unknown): ChatFailure {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  if (/abort/i.test(text)) {
    return { kind: "network", message: "I lost you for a second there. Still with me?" };
  }
  if (/failed to fetch|network|load failed|ERR_INTERNET|ECONN/i.test(text)) {
    return {
      kind: "network",
      message: "I can't reach you right now — check your connection and I'll be right here.",
    };
  }
  return { kind: "unknown", message: "Something got tangled on my end. Tell me again?" };
}

/** Voice (TTS) failing must never break the text loop — she just "loses her voice". */
export const TTS_FAILURE: ChatFailure = {
  kind: "tts",
  message: "(my voice cut out — I'm still here, just quieter)",
};
