import { describe, expect, it, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";

// Stub the WebLLM-backed semantics module before any UI module loads it.
// The real module pulls in `@mlc-ai/web-llm` which doesn't run in JSDOM
// (timeouts on chunk fetches). The stub returns a clean inert API so any
// store action that lazy-imports it completes immediately.
vi.mock("../../engine/semantics/llm", () => ({
  prefillNeighbors: async () => ({}),
  loadCachedNeighbors: async () => ({}),
  clearCache: async () => undefined,
  loadEngine: async () => undefined,
  validateModelAvailable: async () => null,
  DEFAULT_LLM_CONFIG: {},
}));

import { useSimStore } from "../../state/store";
import { App } from "../App";

// Lazy-load every UI component so we can mount them individually too.
import { ControlsPanel } from "../ControlsPanel";
import { LexiconView } from "../LexiconView";
import { GrammarView } from "../GrammarView";
import { EventsLog } from "../EventsLog";
import { Translator } from "../Translator";
import { CompareView } from "../CompareView";
import { NarrativeView } from "../NarrativeView";
import { MapView } from "../MapView";
import { SoundLawsView } from "../SoundLawsView";
import { StemmaView } from "../StemmaView";
import { Glossary } from "../Glossary";
import { ReconstructionQuiz } from "../ReconstructionQuiz";
import { PhonemeInventoryView } from "../PhonemeInventoryView";
import { ActivityHeatmap } from "../ActivityHeatmap";
import { GlobalSearch } from "../GlobalSearch";
import { StatsPanel } from "../StatsPanel";
import { WelcomeBanner } from "../Onboarding";
import { PresetPicker } from "../PresetPicker";
import { ScriptPicker } from "../ScriptPicker";
import { SavedRunsList } from "../SavedRunsList";
import { SeedLexiconEditor } from "../SeedLexiconEditor";
import { EvolutionSpeedPicker } from "../EvolutionSpeedPicker";
import { ThemeToggle } from "../ThemeToggle";
import { AchievementsStrip, AchievementToast } from "../Achievements";
import { UpdateBanner } from "../UpdateBanner";
import { AiSemantics } from "../AiSemantics";
import { ReproduceForm } from "../ReproduceForm";
import { RulesTimeline } from "../RulesTimeline";
import { LanguageTreeView } from "../LanguageTreeView";
import { TimelineChart } from "../TimelineChart";

/**
 * End-to-end render harness. Mounts every UI component against a sim
 * that has been stepped enough generations to exercise every new
 * optional language field — culturalTier advancement, capacity
 * resizing, recarves, suppletion, conjugation classes, derivational
 * suffixes, areal phonology, all running. The test passes if no
 * component throws during render.
 *
 * This catches the "feature added to the engine but the UI never
 * heard about it" failure mode that pure-engine tests can't see —
 * e.g. a component that iterates `paradigms[cat].variants` without a
 * null-check, or that breaks when `lang.colexifiedAs` is undefined.
 */

function step(n: number) {
  const { sim } = useSimStore.getState();
  for (let i = 0; i < n; i++) sim.step();
  // Force a state replacement so React subscribers re-fetch.
  useSimStore.setState({ state: { ...sim.getState() } });
}

describe("UI render harness — every tab and every standalone component", () => {
  beforeEach(() => {
    // Reset to a fresh sim before each render so tests don't bleed
    // selection state into one another.
    useSimStore.getState().reset();
  });

  it("renders the full App at gen 0", () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it("renders the full App after 200 steps (exercises tier, recarves, …)", () => {
    step(200);
    expect(() => render(<App />)).not.toThrow();
  });

  // Mount every panel-level component individually so a failure
  // pinpoints exactly which one is the culprit.
  const PANELS: Array<readonly [string, () => React.ReactElement]> = [
    ["ControlsPanel", () => <ControlsPanel />],
    ["LexiconView", () => <LexiconView />],
    ["GrammarView", () => <GrammarView />],
    ["EventsLog", () => <EventsLog />],
    ["Translator", () => <Translator />],
    ["CompareView", () => <CompareView />],
    ["NarrativeView", () => <NarrativeView />],
    ["MapView", () => <MapView />],
    ["SoundLawsView", () => <SoundLawsView />],
    ["StemmaView", () => <StemmaView />],
    ["Glossary", () => <Glossary />],
    ["ReconstructionQuiz", () => <ReconstructionQuiz />],
    ["PhonemeInventoryView", () => <PhonemeInventoryView />],
    ["ActivityHeatmap", () => <ActivityHeatmap />],
    ["GlobalSearch", () => <GlobalSearch onJumpToLexicon={() => undefined} />],
    ["StatsPanel", () => <StatsPanel />],
    ["WelcomeBanner", () => <WelcomeBanner />],
    ["PresetPicker", () => <PresetPicker />],
    ["ScriptPicker", () => <ScriptPicker />],
    ["SavedRunsList", () => <SavedRunsList />],
    ["SeedLexiconEditor", () => <SeedLexiconEditor onClose={() => undefined} />],
    ["EvolutionSpeedPicker", () => <EvolutionSpeedPicker />],
    ["ThemeToggle", () => <ThemeToggle />],
    ["AchievementsStrip", () => <AchievementsStrip />],
    ["AchievementToast", () => <AchievementToast />],
    ["UpdateBanner", () => <UpdateBanner />],
    ["AiSemantics", () => <AiSemantics />],
    ["ReproduceForm", () => (
      <ReproduceForm langId="L-0" meaning="water" onClose={() => undefined} />
    )],
    ["RulesTimeline", () => <RulesTimeline langId="L-0" maxGen={200} />],
    ["LanguageTreeView", () => <LanguageTreeView />],
    ["TimelineChart", () => <TimelineChart />],
  ];

  for (const [name, factory] of PANELS) {
    it(`renders ${name} at gen 0`, () => {
      expect(() => render(factory())).not.toThrow();
    });
    it(`renders ${name} after 150 steps`, () => {
      step(150);
      expect(() => render(factory())).not.toThrow();
    });
  }
});
