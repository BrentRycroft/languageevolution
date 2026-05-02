import { useEffect, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { Z } from "./zIndex";

/**
 * Lightweight debug overlay. Toggle with the button or ? key (already used
 * for help; consider Ctrl+Shift+D in a follow-up). Renders in the bottom
 * right corner above main content but below modals. Shows:
 *
 *   - generation
 *   - alive leaf count
 *   - rendered FPS while playing (via rAF sample)
 *   - rough state size (kb) of the engine snapshot
 *   - last-fired rule (most recent active rule on the selected language)
 *
 * Designed to be cheap: only updates on store change + at most once per
 * animation frame for FPS.
 */
export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const generation = useSimStore((s) => s.state.generation);
  const tree = useSimStore((s) => s.state.tree);
  const playing = useSimStore((s) => s.playing);
  const selectedLangId = useSimStore((s) => s.selectedLangId);

  const [fps, setFps] = useState(0);
  const lastTimeRef = useRef<number>(performance.now());
  const frameCountRef = useRef(0);

  useEffect(() => {
    if (!open || !playing) return;
    let raf = 0;
    const loop = (t: number) => {
      frameCountRef.current++;
      const dt = t - lastTimeRef.current;
      if (dt >= 500) {
        setFps(Math.round((frameCountRef.current * 1000) / dt));
        frameCountRef.current = 0;
        lastTimeRef.current = t;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, playing]);

  const aliveLeaves = Object.values(tree).filter(
    (n) => n.childrenIds.length === 0 && !n.language.extinct,
  ).length;
  const totalLanguages = Object.keys(tree).length;

  // Rough size estimate: stringify the snapshot. Cheap-ish; runs only when
  // the overlay is open.
  const stateSizeKb = open
    ? Math.round((JSON.stringify(tree).length / 1024) * 10) / 10
    : 0;

  const lang = selectedLangId ? tree[selectedLangId]?.language : undefined;
  const lastRule = lang?.activeRules?.length
    ? [...lang.activeRules].sort(
        (a, b) => (b.lastFireGeneration ?? 0) - (a.lastFireGeneration ?? 0),
      )[0]
    : undefined;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open debug overlay"
        aria-label="Open debug overlay"
        className="ghost"
        style={{
          position: "fixed",
          right: 8,
          bottom: 8,
          zIndex: Z.overlay,
          fontSize: 11,
          padding: "3px 8px",
          opacity: 0.5,
        }}
      >
        debug
      </button>
    );
  }

  return (
    <div
      role="region"
      aria-label="Debug overlay"
      style={{
        position: "fixed",
        right: 8,
        bottom: 8,
        zIndex: Z.overlay,
        background: "rgba(15,31,46,0.92)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-2)",
        padding: 10,
        fontSize: 11,
        fontFamily: "var(--font-mono)",
        minWidth: 220,
        color: "var(--text)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
          gap: 6,
        }}
      >
        <span className="t-muted">debug</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          title="Close debug overlay"
          aria-label="Close debug overlay"
          className="ghost icon-only"
        >
          ×
        </button>
      </div>
      <Row k="gen" v={String(generation)} />
      <Row k="alive" v={`${aliveLeaves} / ${totalLanguages}`} />
      <Row k="state" v={`${stateSizeKb} kb`} />
      {playing && <Row k="fps" v={String(fps)} />}
      {lang && (
        <>
          <Row k="lang" v={lang.name} />
          <Row k="lex" v={String(Object.keys(lang.lexicon).length)} />
          <Row k="rules" v={String(lang.activeRules?.length ?? 0)} />
          {lastRule && (
            <Row
              k="last rule"
              v={`${lastRule.id} (g${lastRule.lastFireGeneration ?? "?"})`}
            />
          )}
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "70px 1fr",
        gap: 6,
        padding: "1px 0",
      }}
    >
      <span className="t-muted">{k}</span>
      <span style={{ color: "var(--accent)", overflow: "hidden", textOverflow: "ellipsis" }}>
        {v}
      </span>
    </div>
  );
}
