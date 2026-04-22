import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";

const DISMISSED_KEY = "lev.onboarding.dismissed.v2";

export function WelcomeBanner() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(true);
    }
  }, []);

  if (dismissed === null || dismissed) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // ignore quota errors
    }
  };

  return (
    <div
      role="region"
      aria-label="Welcome"
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        right: 16,
        zIndex: 10,
        padding: 14,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-3)",
        boxShadow: "var(--shadow-2)",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        pointerEvents: "auto",
      }}
    >
      <div style={{ flex: 1, fontSize: "var(--fs-2)", lineHeight: 1.5 }}>
        <div
          style={{
            fontWeight: "var(--fw-semi)",
            color: "var(--text)",
            marginBottom: 6,
            fontSize: "var(--fs-3)",
          }}
        >
          Welcome to the language evolution simulator
        </div>
        <div style={{ color: "var(--muted)", marginBottom: 4 }}>
          Press <strong style={{ color: "var(--text)" }}>Play</strong> (or <kbd>Space</kbd>) to
          watch a proto-language diverge. Each language{" "}
          <strong style={{ color: "var(--text)" }}>invents its own sound laws</strong> procedurally
          — the first law usually lands around gen 8–16. Open the{" "}
          <strong style={{ color: "var(--text)" }}>Sound laws</strong> tab to see them, or the{" "}
          <strong style={{ color: "var(--text)" }}>Timeline → rules</strong> view for their
          full lifecycle.
        </div>
        <div style={{ color: "var(--muted)" }}>
          Shortcuts: <kbd>Space</kbd> play · <kbd>→</kbd> step · <kbd>F</kbd> fast-forward ·
          <kbd>?</kbd> help · <kbd>1–9</kbd> tabs.
        </div>
      </div>
      <button
        onClick={close}
        aria-label="Dismiss welcome banner"
        className="ghost icon-only"
        style={{ flexShrink: 0 }}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
