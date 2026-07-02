import { useState, lazy, Suspense, type ComponentType } from "react";
import { AriaTalkingView } from "../AriaTalkingView";

// Production app shell (#19): branded header, chat-first layout, conversation
// history explicitly deferred with UX copy, sign-out. The lab views (Avatar
// sandbox + Create Aria) are DEV-only — import.meta.env.DEV gates both the nav
// and the lazy chunks, so no dev tooling reaches a production bundle.

const LiveAvatarLab: ComponentType | null = import.meta.env.DEV
  ? lazy(() => import("../LiveAvatar").then((m) => ({ default: m.LiveAvatar })))
  : null;

// Avatar character-maker (pick a preset face, no upload). DEV-gated so the dev
// sample-avatar CDN URLs aren't in the prod bundle; un-gate once the avatars are
// self-hosted from R2 (security review 2026-06-22).
const CharacterMaker: ComponentType | null = import.meta.env.DEV
  ? lazy(() => import("../avatar/CharacterMaker").then((m) => ({ default: m.CharacterMaker })))
  : null;

type View = "chat" | "avatar" | "avatar3d";

interface Props {
  onSignOut: () => void;
}

export function AppShell({ onSignOut }: Props) {
  const [view, setView] = useState<View>("chat");
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="brand">Aria</h1>
        <div className="header-actions">
          <button
            className="btn btn-ghost"
            onClick={() => setHistoryOpen((o) => !o)}
            aria-expanded={historyOpen}
          >
            Conversations
          </button>
          <button className="btn btn-ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {historyOpen && (
        <aside className="history-panel" data-aria-history>
          <strong>This conversation lives right here.</strong> Saved history across
          visits is coming soon — for now, every visit starts fresh, just the two of you.
        </aside>
      )}

      {import.meta.env.DEV && (
        <nav className="lab-nav" aria-label="Lab views (dev only)">
          <span className="lab-tag">Lab</span>
          <button className="btn" aria-pressed={view === "chat"} onClick={() => setView("chat")}>
            Chat
          </button>
          <button className="btn" aria-pressed={view === "avatar"} onClick={() => setView("avatar")}>
            Avatar (sandbox)
          </button>
          <button className="btn" aria-pressed={view === "avatar3d"} onClick={() => setView("avatar3d")}>
            Create Aria
          </button>
        </nav>
      )}

      {view === "chat" && (
        <section className="chat-panel" aria-label="Chat with Aria">
          <AriaTalkingView />
          {/* Empty state: revealed by CSS only while the conversation has no bubbles
              (see theme.css `.chat-panel:has([data-aria-emotion]:empty)`). */}
          <div className="chat-empty-hint">
            <p className="hint-title">It&apos;s just us here.</p>
            <p className="hint-sub">Say anything — Aria&apos;s listening.</p>
          </div>
        </section>
      )}

      {import.meta.env.DEV && LiveAvatarLab && view === "avatar" && (
        <section className="lab-panel" aria-label="Avatar sandbox">
          <Suspense fallback={null}>
            <LiveAvatarLab />
          </Suspense>
        </section>
      )}

      {import.meta.env.DEV && CharacterMaker && view === "avatar3d" && (
        <section className="lab-panel" aria-label="Create Aria">
          <Suspense fallback={null}>
            <CharacterMaker />
          </Suspense>
        </section>
      )}
    </div>
  );
}
