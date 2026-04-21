import { useEffect, useRef } from "react";
import { useSimStore } from "../state/store";
import { ControlsPanel } from "./ControlsPanel";
import { LexiconView } from "./LexiconView";
import { LanguageTreeView } from "./LanguageTreeView";
import { TimelineChart } from "./TimelineChart";
import { AgentGrid } from "./AgentGrid";

export function App() {
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const step = useSimStore((s) => s.step);
  const reset = useSimStore((s) => s.reset);
  const generation = useSimStore((s) => s.state.generation);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

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
        <h1>Language Evolution Simulator</h1>
        <span className="generation">generation {generation}</span>
        <div className="playback">
          <button className="primary" onClick={togglePlay}>
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={step} disabled={playing}>Step</button>
          <button onClick={reset}>Reset</button>
        </div>
      </header>
      <aside className="controls-panel">
        <ControlsPanel />
      </aside>
      <main className="main">
        <div className="panel" style={{ gridArea: "tree" }}>
          <h3>Language Tree</h3>
          <LanguageTreeView />
        </div>
        <div className="panel" style={{ gridArea: "lexicon" }}>
          <h3>Lexicon</h3>
          <LexiconView />
        </div>
        <div className="panel" style={{ gridArea: "timeline" }}>
          <h3>Timeline</h3>
          <TimelineChart />
        </div>
        <div className="panel" style={{ gridArea: "agents" }}>
          <h3>Agents</h3>
          <AgentGrid />
        </div>
      </main>
    </div>
  );
}
