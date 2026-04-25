import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { ControlsPanel } from "./ControlsPanel";
import { DictionaryView } from "./DictionaryView";
import { GrammarView } from "./GrammarView";
import { EventsLog } from "./EventsLog";
import { Translator } from "./Translator";
import { CompareView } from "./CompareView";
import { MapView } from "./MapView";
import { SoundLawsView } from "./SoundLawsView";
import { Glossary } from "./Glossary";
import { AchievementToast } from "./Achievements";
import { UpdateBanner } from "./UpdateBanner";
import { PhonemeInventoryView } from "./PhonemeInventoryView";
import { AboutModal } from "./AboutModal";
import { StatsPanel } from "./StatsPanel";
import { readShareFromLocation, clearShareFromLocation } from "../share/url";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ThemeToggle, ThemeEffect } from "./ThemeToggle";
import { WelcomeBanner } from "./Onboarding";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { GlobalSearch } from "./GlobalSearch";
import { SelectedLanguageBar } from "./SelectedLanguageBar";
import {
  MenuIcon,
  PlayIcon,
  PauseIcon,
  StepIcon,
  FastForwardIcon,
  ResetIcon,
} from "./icons";

// Lazy-split the two chart/tree views so d3-hierarchy + recharts stay out of
// the initial bundle until their tab is opened.
const LanguageTreeView = lazy(() =>
  import("./LanguageTreeView").then((m) => ({ default: m.LanguageTreeView })),
);
const TimelineChart = lazy(() =>
  import("./TimelineChart").then((m) => ({ default: m.TimelineChart })),
);

function PanelSkeleton() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--muted)",
        fontSize: "var(--fs-2)",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid var(--border)",
          borderTopColor: "var(--accent)",
          borderRadius: "50%",
          animation: "spin 0.9s linear infinite",
        }}
      />
    </div>
  );
}

type Tab =
  | "tree"
  | "map"
  | "dictionary"
  | "timeline"
  | "grammar"
  | "phonemes"
  | "laws"
  | "events"
  | "translate"
  | "compare"
  | "stats"
  | "glossary";

const TABS: { id: Tab; label: string; title: string }[] = [
  { id: "tree", label: "Tree", title: "Phylogenetic tree of languages" },
  { id: "map", label: "Map", title: "2-D map of where languages live" },
  {
    id: "dictionary",
    label: "Dictionary",
    title: "Lexicon + grammar profile of the selected language",
  },
  { id: "timeline", label: "Timeline", title: "Form changes + sound-law lifecycles over time" },
  { id: "grammar", label: "Grammar", title: "Grammar features of the selected language" },
  { id: "phonemes", label: "Phonemes", title: "Segmental + tonal inventory for the selected language" },
  { id: "laws", label: "Sound laws", title: "Procedurally-invented sound laws per language" },
  { id: "events", label: "History", title: "Event log for the selected language" },
  {
    id: "translate",
    label: "Translate",
    title: "Word + sentence translation tools (AI-assisted)",
  },
  {
    id: "compare",
    label: "Compare",
    title: "Side-by-side comparison of two languages — lexicon, narrative, cognates",
  },
  { id: "stats", label: "Stats", title: "Per-language stats dashboard" },
  { id: "glossary", label: "Glossary", title: "Reference for rule families, shift taxa, register" },
];

export function App() {
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const step = useSimStore((s) => s.step);
  const stepN = useSimStore((s) => s.stepN);
  const stepNAsync = useSimStore((s) => s.stepNAsync);
  const reset = useSimStore((s) => s.reset);
  const generation = useSimStore((s) => s.state.generation);

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("tree");
  const [aboutOpen, setAboutOpen] = useState(false);

  // Deep-link loader: if the URL has a ?s=... share payload, decode it and
  // restore the run once. Cleared from the URL so later copies share the
  // user's live state instead.
  useEffect(() => {
    const payload = readShareFromLocation();
    if (!payload) return;
    const { loadConfig } = useSimStore.getState();
    loadConfig(payload.config, payload.replay ?? 0);
    if (payload.biases) {
      const { applyRuleBiasToLanguage } = useSimStore.getState();
      for (const [langId, bias] of Object.entries(payload.biases)) {
        applyRuleBiasToLanguage(langId, bias);
      }
    }
    clearShareFromLocation();
  }, []);

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
      <ThemeEffect />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <AchievementToast />
      <UpdateBanner />
      {aboutOpen && <AboutModal onClose={() => setAboutOpen(false)} />}
      <header className="header">
        <button
          className="menu-toggle ghost icon-only"
          onClick={() => setControlsOpen((v) => !v)}
          aria-label="Toggle controls"
        >
          <MenuIcon size={18} />
        </button>
        <h1
          onClick={() => setAboutOpen(true)}
          style={{ cursor: "pointer" }}
          title="About this project"
        >
          Language Evolution
        </h1>
        <span className="generation">gen {generation}</span>
        <GlobalSearch onJumpToLexicon={() => setActiveTab("dictionary")} />
        <div className="playback">
          <button className="primary icon-only" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <button
            onClick={step}
            disabled={playing}
            className="icon-only"
            aria-label="Step one generation"
            title="Step one generation (→)"
          >
            <StepIcon size={16} />
          </button>
          <button
            onClick={() => {
              void stepNAsync(50);
            }}
            disabled={playing}
            className="icon-only"
            aria-label="Fast-forward 50 generations"
            title="Fast-forward 50 generations (F)"
          >
            <FastForwardIcon size={16} />
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  "Reset simulation to generation 0? This wipes the current run (saved runs are preserved).",
                )
              ) {
                reset();
              }
            }}
            className="icon-only"
            aria-label="Reset simulation"
            title="Reset — rolls a fresh seed (Cmd/Ctrl+R)"
          >
            <ResetIcon size={16} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <nav className="tab-bar" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={activeTab === t.id}
            className={activeTab === t.id ? "active" : ""}
            onClick={() => setActiveTab(t.id)}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <SelectedLanguageBar />

      <div
        className={`controls-backdrop ${controlsOpen ? "open" : ""}`}
        onClick={() => setControlsOpen(false)}
      />

      <aside className={`controls-panel ${controlsOpen ? "open" : ""}`}>
        <ControlsPanel />
      </aside>

      <main id="main-content" className="main" style={{ position: "relative" }}>
        {activeTab === "tree" && <WelcomeBanner />}
        {activeTab === "tree" && (
          <div className="panel panel-single">
            <h3>Language Tree</h3>
            <ActivityHeatmap />
            <Suspense fallback={<PanelSkeleton />}>
              <LanguageTreeView />
            </Suspense>
          </div>
        )}
        {activeTab === "dictionary" && (
          <div className="panel panel-single">
            <h3>Dictionary</h3>
            <DictionaryView />
          </div>
        )}
        {activeTab === "timeline" && (
          <div className="panel panel-single">
            <h3>Timeline</h3>
            <Suspense fallback={<PanelSkeleton />}>
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
        {activeTab === "phonemes" && (
          <div className="panel panel-single">
            <h3>Phoneme inventory</h3>
            <PhonemeInventoryView />
          </div>
        )}
        {activeTab === "laws" && (
          <div className="panel panel-single">
            <h3>Sound laws</h3>
            <SoundLawsView />
          </div>
        )}
        {activeTab === "glossary" && (
          <div className="panel panel-single">
            <h3>Glossary</h3>
            <Glossary />
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
        {activeTab === "compare" && (
          <div className="panel panel-single">
            <h3>Compare</h3>
            <CompareView />
          </div>
        )}
        {activeTab === "stats" && (
          <div className="panel panel-single">
            <h3>Stats</h3>
            <StatsPanel />
          </div>
        )}
        {activeTab === "map" && (
          <div className="panel panel-single">
            <h3>World Map</h3>
            <MapView />
          </div>
        )}
      </main>
    </div>
  );
}
