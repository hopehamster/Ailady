import { Component, type ErrorInfo, type ReactNode } from "react";

// Product error boundary (#24): an unexpected render crash shows a warm
// recovery card instead of a white screen or a raw stack. Reload is the only
// safe recovery from an unknown render fault.

interface Props {
  children: ReactNode;
}

interface State {
  crashed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Console only (dev diagnosis) — the user never sees the stack.
    console.error("ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          background: "#0A1628",
          color: "#e5e7eb",
          fontFamily: "system-ui, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18 }}>Something broke on my side — not you, promise.</div>
        <div style={{ fontSize: 14, color: "#9fb2c8" }}>
          Reload and I&apos;ll be right where you left me.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 8,
            padding: "8px 20px",
            cursor: "pointer",
            fontSize: 15,
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
