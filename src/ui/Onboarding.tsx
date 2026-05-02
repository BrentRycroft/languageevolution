import { useEffect, useState } from "react";
import { CloseIcon } from "./icons";
import { useSimStore } from "../state/store";
import { Z } from "./zIndex";

const DISMISSED_KEY = "lev.onboarding.dismissed.v3";

interface Step {
  title: string;
  body: React.ReactNode;
}

const STEPS: Step[] = [
  {
    title: "Welcome to the language evolution simulator",
    body: (
      <>
        Press <strong className="t-text">Play</strong> (or <kbd>Space</kbd>) to
        watch a proto-language diverge. Each language{" "}
        <strong className="t-text">invents its own sound laws</strong> procedurally
        — the first law usually lands around gen 8–16.
      </>
    ),
  },
  {
    title: "Tree → Translator → Compare → Map",
    body: (
      <>
        Start on <strong className="t-text">Tree</strong> to see the family
        diverging. Use <strong className="t-text">Translate</strong>{" "}
        (English → target) and reverse glossing to read what each language
        is saying. <strong className="t-text">Compare</strong> two languages
        side-by-side: grammar diff, paradigms, inventory, narrative.{" "}
        <strong className="t-text">Map</strong> shows territory + areal
        contact lines.
      </>
    ),
  },
  {
    title: "Cognates and the phonology sandbox",
    body: (
      <>
        The <strong className="t-text">Cognates</strong> tab shows every
        daughter's form for one meaning + the MSA-reconstructed
        proto-form. The <strong className="t-text">Sandbox</strong> tab
        lets you pick a sound rule and apply it to a chosen word
        deterministically — useful for understanding what each rule
        actually does.
      </>
    ),
  },
  {
    title: "Save your config + keyboard shortcuts",
    body: (
      <>
        Like the run? Open the controls panel and click{" "}
        <strong className="t-text">save current as preset</strong> to keep
        the configuration. Shortcuts: <kbd>Space</kbd> play · <kbd>→</kbd>{" "}
        step · <kbd>F</kbd> fast-forward · <kbd>?</kbd> help ·{" "}
        <kbd>1–9</kbd> tabs.
      </>
    ),
  },
];

export function WelcomeBanner() {
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const generation = useSimStore((s) => s.state.generation);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {
      setDismissed(true);
    }
  }, []);

  if (dismissed === null || dismissed) return null;
  if (generation > 0) return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
    }
  };

  const step = STEPS[stepIndex]!;
  const isLast = stepIndex === STEPS.length - 1;
  const isFirst = stepIndex === 0;

  return (
    <div
      role="region"
      aria-label={`Welcome — step ${stepIndex + 1} of ${STEPS.length}`}
      style={{
        position: "absolute",
        top: 16,
        left: 16,
        right: 16,
        zIndex: Z.banner,
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
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontWeight: "var(--fw-semi)",
              color: "var(--text)",
              fontSize: "var(--fs-3)",
            }}
          >
            {step.title}
          </span>
          <span className="t-muted" style={{ fontSize: 11 }}>
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div style={{ color: "var(--muted)", marginBottom: 8 }}>{step.body}</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className="ghost"
            disabled={isFirst}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
            style={{ fontSize: 12, padding: "3px 10px" }}
          >
            ← back
          </button>
          {!isLast ? (
            <button
              type="button"
              className="primary"
              onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              style={{ fontSize: 12, padding: "3px 10px" }}
            >
              next →
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={close}
              style={{ fontSize: 12, padding: "3px 10px" }}
            >
              get started
            </button>
          )}
          <span style={{ flex: 1 }} />
          <div
            role="presentation"
            style={{ display: "flex", gap: 4 }}
            aria-hidden
          >
            {STEPS.map((_, i) => (
              <span
                key={i}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: i === stepIndex ? "var(--accent)" : "var(--border-strong)",
                  display: "inline-block",
                }}
              />
            ))}
          </div>
        </div>
      </div>
      <button
        onClick={close}
        aria-label="Dismiss welcome tour"
        className="ghost icon-only"
        style={{ flexShrink: 0 }}
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}
