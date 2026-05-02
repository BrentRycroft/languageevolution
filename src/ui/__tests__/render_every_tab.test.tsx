import { describe, expect, it, beforeEach } from "vitest";
import { render } from "@testing-library/react";

import { useSimStore } from "../../state/store";
import { App } from "../App";

import { ControlsPanel } from "../ControlsPanel";
import { LexiconView } from "../LexiconView";
import { GrammarView } from "../GrammarView";
import { EventsLog } from "../EventsLog";
import { Translator } from "../Translator";
import { CompareView } from "../CompareView";
import { MapView } from "../MapView";
import { SoundLawsView } from "../SoundLawsView";
import { StemmaView } from "../StemmaView";
import { Glossary } from "../Glossary";
import { PhonemeInventoryView } from "../PhonemeInventoryView";
import { ActivityHeatmap } from "../ActivityHeatmap";
import { GlobalSearch } from "../GlobalSearch";
import { StatsPanel } from "../StatsPanel";
import { WordMapView } from "../WordMapView";
import { WelcomeBanner } from "../Onboarding";
import { PresetPicker } from "../PresetPicker";
import { ScriptPicker } from "../ScriptPicker";
import { SavedRunsList } from "../SavedRunsList";
import { SeedLexiconEditor } from "../SeedLexiconEditor";
import { EvolutionSpeedPicker } from "../EvolutionSpeedPicker";
import { ThemeToggle } from "../ThemeToggle";
import { AchievementsStrip, AchievementToast } from "../Achievements";
import { UpdateBanner } from "../UpdateBanner";
import { ReproduceForm } from "../ReproduceForm";
import { RulesTimeline } from "../RulesTimeline";
import { LanguageTreeView } from "../LanguageTreeView";
import { TimelineChart } from "../TimelineChart";

function step(n: number) {
  const { sim } = useSimStore.getState();
  for (let i = 0; i < n; i++) sim.step();
  useSimStore.setState({ state: { ...sim.getState() } });
}

describe("UI render harness — every tab and every standalone component", () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it("renders the full App at gen 0", () => {
    expect(() => render(<App />)).not.toThrow();
  });

  it("renders the full App after 200 steps (exercises tier, recarves, …)", () => {
    step(200);
    expect(() => render(<App />)).not.toThrow();
  });

  const PANELS: Array<readonly [string, () => React.ReactElement]> = [
    ["ControlsPanel", () => <ControlsPanel />],
    ["LexiconView", () => <LexiconView />],
    ["GrammarView", () => <GrammarView />],
    ["EventsLog", () => <EventsLog />],
    ["Translator", () => <Translator />],
    ["CompareView", () => <CompareView />],
    ["MapView", () => <MapView />],
    ["SoundLawsView", () => <SoundLawsView />],
    ["StemmaView", () => <StemmaView />],
    ["Glossary", () => <Glossary />],
    ["PhonemeInventoryView", () => <PhonemeInventoryView />],
    ["ActivityHeatmap", () => <ActivityHeatmap />],
    ["GlobalSearch", () => <GlobalSearch onJumpToLexicon={() => undefined} />],
    ["StatsPanel", () => <StatsPanel />],
    ["WordMapView", () => <WordMapView />],
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
