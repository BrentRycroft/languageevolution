import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("Simulation crashed:", error);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 24,
            maxWidth: 560,
            margin: "40px auto",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontFamily: "inherit",
          }}
        >
          <h2 style={{ marginTop: 0, color: "var(--danger)" }}>Simulation crashed</h2>
          <pre
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 12,
              color: "var(--muted)",
              background: "var(--panel-2)",
              padding: 12,
              borderRadius: 4,
            }}
          >
            {this.state.error.message}
            {this.state.error.stack ? `\n\n${this.state.error.stack}` : ""}
          </pre>
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button className="primary" onClick={this.reset}>
              Try again
            </button>
            <button
              onClick={() => {
                const text = `${this.state.error!.message}\n\n${
                  this.state.error!.stack ?? ""
                }`;
                if (typeof navigator !== "undefined" && navigator.clipboard) {
                  navigator.clipboard.writeText(text).catch((e) => {
                    console.warn("clipboard write failed", e);
                  });
                }
              }}
              title="Copy error message + stack trace to clipboard"
            >
              Copy error
            </button>
            <button
              onClick={() => {
                if (
                  confirm(
                    "Permanently delete all saved runs from this browser? This cannot be undone.",
                  )
                ) {
                  localStorage.removeItem("lev.runs.v1.index");
                  this.reset();
                }
              }}
            >
              Clear saved runs &amp; retry
            </button>
            <button onClick={() => location.reload()}>Reload page</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
