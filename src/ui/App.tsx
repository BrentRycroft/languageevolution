import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { ControlsPanel } from "./ControlsPanel";
import { DictionaryView } from "./DictionaryView";
import { WordMapView } from "./WordMapView";
import { GrammarView } from "./GrammarView";
import { LanguageProfile } from "./LanguageProfile";
import { EventsLog } from "./EventsLog";
import { Translator } from "./Translator";
import { CompareView } from "./CompareView";
import { CognateExplorer } from "./CognateExplorer";
import { PhonologySandbox } from "./PhonologySandbox";
import { MapView } from "./MapView";
import { SoundLawsView } from "./SoundLawsView";
import { Glossary } from "./Glossary";
import { AchievementToast } from "./Achievements";
import { PersistenceToast } from "./PersistenceToast";
import { ConfirmDialog } from "./ConfirmDialog";
import { UpdateBanner } from "./UpdateBanner";
import { DebugOverlay } from "./DebugOverlay";
import { PhonemeInventoryView } from "./PhonemeInventoryView";
import { AboutModal } from "./AboutModal";
import { StatsPanel } from "./StatsPanel";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";
import { readShareFromLocation, clearShareFromLocation } from "../share/url";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { ThemeToggle, ThemeEffect } from "./ThemeToggle";
import { WelcomeBanner } from "./Onboarding";
import { ActivityHeatmap } from "./ActivityHeatmap";
import { GlobalSearch } from "./GlobalSearch";
import { SelectedLanguageBar } from "./SelectedLanguageBar";
import { TABS, type TabId as Tab } from "./tabs";
import { TabOverflowMenu } from "./TabOverflowMenu";
import {
  MenuIcon,
  PlayIcon,
  PauseIcon,
  StepIcon,
  FastForwardIcon,
  ResetIcon,
} from "./icons";

const LanguageTreeView = lazy(() =>
  import("./LanguageTreeView").then((m) => ({ default: m.LanguageTreeView })),
);
const TimelineChart = lazy(() =>
  import("./TimelineChart").then((m) => ({ default: m.TimelineChart })),
);

/**
 * Phase 29 Tranche 6c: surface the stepN abort flag as a visible
 * button. Only renders while the abort flag is reset to false (i.e.
 * a long stepN loop is potentially in flight). Pressing it sets the
 * flag and the next gen-boundary in `stepN` breaks out.
 */
function CancelStepButton() {
  const aborted = useSimStore((s) => s.stepAbortRequested);
  const cancel = useSimStore((s) => s.cancelStep);
  return (
    <button
      onClick={cancel}
      disabled={aborted}
      className="icon-only"
      aria-label="Cancel fast-forward"
      title="Cancel an in-flight fast-forward at the next generation boundary"
      style={{ opacity: aborted ? 0.4 : 1 }}
    >
      ✕
    </button>
  );
}

function PanelSkeleton() {
  return (
    <div
      className="col-8"
      style={{ flex: 1, minHeight: 0, padding: 16 }}
      aria-busy="true"
      aria-label="Loading panel"
    >
      <div className="skeleton" style={{ height: 24, width: "40%" }} />
      <div className="skeleton" style={{ height: 16, width: "85%" }} />
      <div className="skeleton" style={{ height: 16, width: "70%" }} />
      <div className="skeleton" style={{ height: 16, width: "90%" }} />
      <div className="skeleton" style={{ height: 16, width: "60%" }} />
    </div>
  );
}

export function App() {
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const togglePlay = useSimStore((s) => s.togglePlay);
  const step = useSimStore((s) => s.step);
  const stepN = useSimStore((s) => s.stepN);
  const stepNAsync = useSimStore((s) => s.stepNAsync);
  const reset = useSimStore((s) => s.reset);
  const showConfirm = useSimStore((s) => s.showConfirm);
  const generation = useSimStore((s) => s.state.generation);
  const yearsPerGen = useSimStore(
    (s) => s.config.yearsPerGeneration ?? YEARS_PER_GENERATION,
  );

  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number>(0);

  const [controlsOpen, setControlsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("tree");
  const [aboutOpen, setAboutOpen] = useState(false);

  useEffect(() => {
    const payload = readShareFromLocation();
    if (!payload) return;
    const { loadConfig } = useSimStore.getState();
    // Phase 29 Tranche 8f: when the share URL carries a state
    // snapshot (v2), pass it through to loadConfig so the recipient
    // sees the exact tree instead of replaying from gen 0. v1 URLs
    // (no snapshot) keep the replay behaviour.
    loadConfig(
      payload.config,
      payload.replay ?? 0,
      payload.stateSnapshot,
    );
    if (payload.biases) {
      const { applyRuleBiasToLanguage } = useSimStore.getState();
      for (const [langId, bias] of Object.entries(payload.biases)) {
        applyRuleBiasToLanguage(langId, bias);
      }
    }
    clearShareFromLocation();
  }, []);

  const requestGlobalSearchOpen = useSimStore((s) => s.requestGlobalSearchOpen);
  useKeyboardShortcuts({
    playing,
    togglePlay,
    step,
    stepN,
    reset,
    setActiveTab,
    activeTab,
    openGlobalSearch: requestGlobalSearchOpen,
  });

  useEffect(() => {
    if (!playing) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const intervalMs = 1000 / speed;
    const MAX_STEPS_PER_FRAME = 5;
    const loop = (ts: number) => {
      if (!lastRef.current) lastRef.current = ts;
      let iters = 0;
      while (ts - lastRef.current >= intervalMs && iters < MAX_STEPS_PER_FRAME) {
        useSimStore.getState().step();
        lastRef.current += intervalMs;
        iters++;
      }
      if (iters >= MAX_STEPS_PER_FRAME) lastRef.current = ts;
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
      <PersistenceToast />
      <ConfirmDialog />
      <UpdateBanner />
      <DebugOverlay />
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
        <span
          className="generation"
          title={`Each generation represents ${yearsPerGen} years (the demographic norm). gen ${generation} ≈ ${formatElapsed(generation, yearsPerGen)} elapsed.`}
        >
          gen {generation} <span className="t-muted" style={{ fontWeight: "normal", marginLeft: 4 }}>· {formatElapsed(generation, yearsPerGen)}</span>
        </span>
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
          <CancelStepButton />
          <button
            onClick={async () => {
              const ok = await showConfirm({
                title: "Reset simulation?",
                message:
                  "This wipes the current run and rolls back to generation 0. Saved runs are preserved.",
                confirmLabel: "Reset",
                danger: true,
              });
              if (ok) reset();
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
        {TABS.slice(0, 9).map((t) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={activeTab === t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={activeTab === t.id ? 0 : -1}
            className={activeTab === t.id ? "active" : ""}
            onClick={() => setActiveTab(t.id)}
            title={t.title}
          >
            {t.label}
          </button>
        ))}
        {TABS.length > 9 && (
          <TabOverflowMenu
            tabs={TABS.slice(9)}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        )}
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
          <div className="panel panel-single" role="tabpanel" id="tabpanel-tree" aria-labelledby="tab-tree">
            <h3>Language Tree</h3>
            <ActivityHeatmap />
            <Suspense fallback={<PanelSkeleton />}>
              <LanguageTreeView />
            </Suspense>
          </div>
        )}
        {activeTab === "dictionary" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-dictionary" aria-labelledby="tab-dictionary">
            <h3>Dictionary</h3>
            <DictionaryView />
          </div>
        )}
        {activeTab === "wordmap" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-wordmap" aria-labelledby="tab-wordmap">
            <h3>Words</h3>
            <WordMapView />
          </div>
        )}
        {activeTab === "timeline" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-timeline" aria-labelledby="tab-timeline">
            <h3>Timeline</h3>
            <Suspense fallback={<PanelSkeleton />}>
              <TimelineChart />
            </Suspense>
          </div>
        )}
        {activeTab === "grammar" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-grammar" aria-labelledby="tab-grammar">
            <h3>Grammar</h3>
            <GrammarView />
          </div>
        )}
        {activeTab === "phonemes" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-phonemes" aria-labelledby="tab-phonemes">
            <h3>Phoneme inventory</h3>
            <PhonemeInventoryView />
          </div>
        )}
        {activeTab === "laws" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-laws" aria-labelledby="tab-laws">
            <h3>Sound laws</h3>
            <SoundLawsView />
          </div>
        )}
        {activeTab === "glossary" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-glossary" aria-labelledby="tab-glossary">
            <h3>Glossary</h3>
            <Glossary />
          </div>
        )}
        {activeTab === "events" && (
          <div
            className="panel panel-single"
            role="tabpanel"
            id="tabpanel-events"
            aria-labelledby="tab-events"
          >
            <h3>History</h3>
            <EventsLog />
          </div>
        )}
        {activeTab === "translate" && (
          <div
            className="panel panel-single"
            role="tabpanel"
            id="tabpanel-translate"
            aria-labelledby="tab-translate"
          >
            <h3>Translator</h3>
            <Translator />
          </div>
        )}
        {activeTab === "compare" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-compare" aria-labelledby="tab-compare">
            <h3>Compare</h3>
            <CompareView />
          </div>
        )}
        {activeTab === "cognates" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-cognates" aria-labelledby="tab-cognates">
            <h3>Cognates</h3>
            <CognateExplorer />
          </div>
        )}
        {activeTab === "sandbox" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-sandbox" aria-labelledby="tab-sandbox">
            <h3>Phonology sandbox</h3>
            <PhonologySandbox />
          </div>
        )}
        {activeTab === "stats" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-stats" aria-labelledby="tab-stats">
            <h3>Stats</h3>
            <StatsPanel />
          </div>
        )}
        {activeTab === "map" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-map" aria-labelledby="tab-map">
            <h3>World Map</h3>
            <MapView />
          </div>
        )}
        {activeTab === "profile" && (
          <div className="panel panel-single" role="tabpanel" id="tabpanel-profile" aria-labelledby="tab-profile">
            <h3>Language Profile</h3>
            <LanguageProfile />
          </div>
        )}
      </main>
    </div>
  );
}
