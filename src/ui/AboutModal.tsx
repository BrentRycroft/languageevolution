import { useEffect } from "react";
import { CloseIcon } from "./icons";

interface Props {
  onClose: () => void;
}

/**
 * About / credits modal. Lists the tech stack, the procedural engine in
 * plain language, and links to the repo. Dismissed on ESC or backdrop click.
 */
export function AboutModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0, 0, 0, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520,
          width: "100%",
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-3)",
          padding: 20,
          boxShadow: "var(--shadow-3)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: "var(--fs-3)" }}>Language Evolution</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="ghost icon-only ml-auto"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div style={{ fontSize: "var(--fs-2)", color: "var(--muted)", lineHeight: 1.6 }}>
          <p style={{ marginTop: 0 }}>
            A browser-only simulator of linguistic evolution. A proto-language
            invents its own sound laws procedurally, splits into daughter
            languages, borrows from its siblings, and drifts semantically —
            all deterministically from a seed.
          </p>
          <p>
            <strong className="t-text">Tech:</strong> React + Zustand + TypeScript,
            Recharts, d3-hierarchy, WebLLM (Ministral 3B). All state lives in
            your browser. No server-side anything.
          </p>
          <p>
            <strong className="t-text">Tips:</strong> press <kbd>?</kbd> for
            keyboard shortcuts, open the <em>Glossary</em> tab to learn what
            the rule families and shift taxa mean, and the <em>Sound laws</em>{" "}
            tab to read the procedurally-invented rules live.
          </p>
          <p style={{ fontSize: "var(--fs-1)", marginBottom: 0 }}>
            Source:{" "}
            <a
              href="https://github.com/BrentRycroft/languageevolution"
              target="_blank"
              rel="noopener noreferrer"
            >
              BrentRycroft/languageevolution
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
