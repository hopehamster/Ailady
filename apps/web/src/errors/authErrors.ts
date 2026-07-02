// Product copy for sign-in failures (#19), same discipline as chatErrors (#24):
// warm, in-world, actionable — never a raw status code or error id.

import type { AuthErrorKind } from "../shell/auth/authService";

export function authFailureCopy(kind: AuthErrorKind): string {
  switch (kind) {
    case "invalid-phone":
      return "That number doesn't look quite right — mind checking it?";
    case "invalid-code":
      return "That code didn't match. Take another look and try again?";
    case "expired-code":
      return "That code expired on us — send yourself a fresh one.";
    case "rate-limited":
      return "Easy — a few too many tries. Give it a minute, then try again.";
    case "unavailable":
      return "Aria isn't opening the door for new sign-ins just yet. Try again soon.";
    case "network":
      return "I can't reach the server right now — check your connection and try again.";
    case "unknown":
      return "Something got tangled during sign-in. Try once more?";
  }
}
