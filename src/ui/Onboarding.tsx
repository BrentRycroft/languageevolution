import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";

const DISMISSED_KEY = "lev.onboarding.dismissed.v1";

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
        padding: 12,
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
      <div style={{ flex: 1, fontSize: "var(--fs-2)" }}>
        <div
          style={{
            fontWeight: "var(--fw-semi)",
            color: "var(--text)",
            marginBottom: 4,
          }}
        >
          Welcome to the language evolution simulator
        </div>
        <div style={{ color: "var(--muted)" }}>
          Press <strong style={{ color: "var(--text)" }}>Play</strong> (or space) to watch a proto-language diverge over generations.
          Try a preset like <em>Proto-Indo-European</em>, then open the Tree, Lexicon, or Translate tabs.
          Shortcuts: <code>Space</code> play/pause, <code>→</code> step, <code>F</code> fast-forward, <code>1–6</code> tabs.
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
