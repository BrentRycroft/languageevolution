import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { ControlsPanel } from "./ControlsPanel";
import { LexiconView } from "./LexiconView";
import { GrammarView } from "./GrammarView";
import { EventsLog } from "./EventsLog";
import { Translator } from "./Translator";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

// Lazy-split the two chart/tree views so d3-hierarchy + recharts stay out of
// the initial bundle until their tab is opened.
const LanguageTreeView = lazy(() =>
  import("./LanguageTreeView").then((m) => ({ default: m.LanguageTreeView })),
);
const TimelineChart = lazy(() =>
  import("./TimelineChart").then((m) => ({ default: m.TimelineChart })),
);

function Loading() {
  return (
    <div style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>
      Loading…
    </div>
  );
}

type Tab = "tree" | "lexicon" | "timeline" | "grammar" | "events" | "translate";

const TABS: { id: Tab; label: string }[] = [
  { id: "tree", label: "Tree" },
  { id: "lexicon", label: "Lexicon" },
  { id: "timeline", label: "Timeline" },
  { id: "grammar", label: "Grammar" },
  { id: "events", label: "History" },
  { id: "translate", label: "Translate" },
];

export function App() {
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const step = useSimStore((s) => s.step);
  const stepN = useSimStore((s) => s.stepN);
  const reset = useSimStore((s) => s.reset);
  const generation = useSimStore((s) => s.state.generation);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("tree");

  useKeyboardShortcuts({ playing, togglePlay, step, stepN, reset, setActiveTab });

  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const intervalMs = 1000 / speed;
    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      while (ts - lastRef.current >= intervalMs) {
        useSimStore.getState().step();
        lastRef.current += intervalMs;
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    lastRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playing, speed]);

  return (
    <div className="app">
      <header className="header">
        <button
          className="menu-toggle"
          onClick={() => setControlsOpen((v) => !v)}
          aria-label="Toggle controls"
        >
          ☰
        </button>
        <h1>Language Evolution</h1>
        <span className="generation">gen {generation}</span>
        <div className="playback">
          <button className="primary" onClick={togglePlay}>
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={step} disabled={playing}>Step</button>
          <button
            onClick={() => stepN(50)}
            disabled={playing}
            title="Fast-forward 50 generations"
          >
            +50
          </button>
          <button
            onClick={() => {
              if (confirm("Reset simulation to generation 0? This wipes the current run (saved runs are preserved).")) {
                reset();
              }
            }}
          >
            Reset
          </button>
        </div>
      </header>

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={activeTab === t.id ? "active" : ""}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div
        className={`controls-backdrop ${controlsOpen ? "open" : ""}`}
        onClick={() => setControlsOpen(false)}
      />

      <aside className={`controls-panel ${controlsOpen ? "open" : ""}`}>
        <ControlsPanel />
      </aside>

      <main className="main">
        {activeTab === "tree" && (
          <div className="panel panel-single">
            <h3>Language Tree</h3>
            <Suspense fallback={<Loading />}>
              <LanguageTreeView />
            </Suspense>
          </div>
        )}
        {activeTab === "lexicon" && (
          <div className="panel panel-single">
            <h3>Lexicon</h3>
            <LexiconView />
          </div>
        )}
        {activeTab === "timeline" && (
          <div className="panel panel-single">
            <h3>Timeline</h3>
            <Suspense fallback={<Loading />}>
              <TimelineChart />
            </Suspense>
          </div>
        )}
        {activeTab === "grammar" && (
          <div className="panel panel-single">
            <h3>Grammar</h3>
            <GrammarView />
          </div>
        )}
        {activeTab === "events" && (
          <div className="panel panel-single">
            <h3>History</h3>
            <EventsLog />
          </div>
        )}
        {activeTab === "translate" && (
          <div className="panel panel-single">
            <h3>Translator</h3>
            <Translator />
          </div>
        )}
      </main>
    </div>
  );
}
