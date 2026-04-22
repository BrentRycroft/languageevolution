import { useState, type ReactNode } from "react";
import { useSimStore } from "../state/store";
import { CATALOG } from "../engine/phonology/catalog";
import { GENESIS_CATALOG } from "../engine/genesis/catalog";
import { SavedRunsList } from "./SavedRunsList";
import { StatsPanel } from "./StatsPanel";
import { ChangePreview } from "./ChangePreview";
import { SeedLexiconEditor } from "./SeedLexiconEditor";
import { AiSemantics } from "./AiSemantics";
import { PresetPicker } from "./PresetPicker";
import { EvolutionSpeedPicker } from "./EvolutionSpeedPicker";
import {
  exportLexiconsJSON,
  exportLexiconsCSV,
  exportTreeNewick,
  exportSnapshot,
  importSnapshot,
} from "../persistence/export";
import { useRef } from "react";

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div className="slider-row">
      <label>{label}</label>
      <span className="value">{format ? format(value) : value.toFixed(2)}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ gridColumn: "1 / span 2" }}
      />
    </div>
  );
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="toggle-row">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
      />
      <label>{label}</label>
    </div>
  );
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="section collapsible-section" open={defaultOpen}>
      <summary>
        <h4 style={{ display: "inline-block", margin: 0 }}>{title}</h4>
      </summary>
      <div style={{ paddingTop: 6 }}>{children}</div>
    </details>
  );
}

export function ControlsPanel() {
  const config = useSimStore((s) => s.config);
  const speed = useSimStore((s) => s.speed);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const updateModes = useSimStore((s) => s.updateModes);
  const updatePhonology = useSimStore((s) => s.updatePhonology);
  const updateTree = useSimStore((s) => s.updateTree);
  const updateGenesis = useSimStore((s) => s.updateGenesis);
  const updateGrammar = useSimStore((s) => s.updateGrammar);
  const updateSemantics = useSimStore((s) => s.updateSemantics);
  const updateObsolescence = useSimStore((s) => s.updateObsolescence);
  const updateMorphologyRates = useSimStore((s) => s.updateMorphologyRates);
  const setChangeEnabled = useSimStore((s) => s.setChangeEnabled);
  const setChangeWeight = useSimStore((s) => s.setChangeWeight);
  const setGenesisEnabled = useSimStore((s) => s.setGenesisEnabled);
  const setSeed = useSimStore((s) => s.setSeed);

  const [seedEditorOpen, setSeedEditorOpen] = useState(false);
  const enabledSet = new Set(config.phonology.enabledChangeIds);
  const genesisSet = new Set(config.genesis.enabledRuleIds);

  return (
    <div>
      <Section title="Preset" defaultOpen>
        <PresetPicker />
      </Section>

      <Section title="Evolution speed" defaultOpen>
        <EvolutionSpeedPicker />
      </Section>

      <Section title="Playback" defaultOpen>
        <Slider
          label="Speed (steps/sec)"
          value={speed}
          min={1}
          max={30}
          step={1}
          onChange={setSpeed}
          format={(v) => `${v}/s`}
        />
      </Section>

      <Section title="Modes">
        <Toggle
          label="Phonological drift"
          value={config.modes.phonology}
          onChange={(v) => updateModes({ phonology: v })}
        />
        <Toggle
          label="Language splits (tree)"
          value={config.modes.tree}
          onChange={(v) => updateModes({ tree: v })}
        />
        <Toggle
          label="Language death"
          value={config.modes.death}
          onChange={(v) => updateModes({ death: v })}
        />
        <Toggle
          label="Word genesis"
          value={config.modes.genesis}
          onChange={(v) => updateModes({ genesis: v })}
        />
        <Toggle
          label="Grammar drift"
          value={config.modes.grammar}
          onChange={(v) => updateModes({ grammar: v })}
        />
        <Toggle
          label="Semantic drift"
          value={config.modes.semantics}
          onChange={(v) => updateModes({ semantics: v })}
        />
      </Section>

      <Section title="Rates" defaultOpen={false}>
        <Slider
          label="Global rate"
          value={config.phonology.globalRate}
          min={0}
          max={3}
          step={0.1}
          onChange={(v) => updatePhonology({ globalRate: v })}
        />
        <Slider
          label="Split prob. / gen"
          value={config.tree.splitProbabilityPerGeneration}
          min={0}
          max={0.3}
          step={0.01}
          onChange={(v) => updateTree({ splitProbabilityPerGeneration: v })}
        />
        <Slider
          label="Max leaves"
          value={config.tree.maxLeaves}
          min={1}
          max={12}
          step={1}
          onChange={(v) => updateTree({ maxLeaves: Math.round(v) })}
          format={(v) => String(Math.round(v))}
        />
        <Slider
          label="Death prob. / gen"
          value={config.tree.deathProbabilityPerGeneration}
          min={0}
          max={0.1}
          step={0.005}
          onChange={(v) => updateTree({ deathProbabilityPerGeneration: v })}
        />
        <Slider
          label="Genesis rate"
          value={config.genesis.globalRate}
          min={0}
          max={0.3}
          step={0.01}
          onChange={(v) => updateGenesis({ globalRate: v })}
        />
        <Slider
          label="Grammar drift / gen"
          value={config.grammar.driftProbabilityPerGeneration}
          min={0}
          max={0.15}
          step={0.005}
          onChange={(v) => updateGrammar({ driftProbabilityPerGeneration: v })}
        />
        <Slider
          label="Semantic drift / gen"
          value={config.semantics.driftProbabilityPerGeneration}
          min={0}
          max={0.1}
          step={0.005}
          onChange={(v) => updateSemantics({ driftProbabilityPerGeneration: v })}
        />
        <Slider
          label="Obsolescence / pair"
          value={config.obsolescence.probabilityPerPairPerGeneration}
          min={0}
          max={0.2}
          step={0.005}
          onChange={(v) => updateObsolescence({ probabilityPerPairPerGeneration: v })}
        />
        <Slider
          label="Grammaticalization"
          value={config.morphology.grammaticalizationProbability}
          min={0}
          max={0.1}
          step={0.005}
          onChange={(v) =>
            updateMorphologyRates({ grammaticalizationProbability: v })
          }
        />
        <Slider
          label="Paradigm merge"
          value={config.morphology.paradigmMergeProbability}
          min={0}
          max={0.1}
          step={0.005}
          onChange={(v) => updateMorphologyRates({ paradigmMergeProbability: v })}
        />
      </Section>

      <Section title="Seed" defaultOpen={false}>
        <input
          type="text"
          value={config.seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="seed"
          aria-label="Random seed"
        />
        <button
          style={{ marginTop: 6, width: "100%" }}
          onClick={() => setSeedEditorOpen(true)}
        >
          Edit seed lexicon ({Object.keys(config.seedLexicon).length})
        </button>
      </Section>

      <Section title="Preview" defaultOpen={false}>
        <ChangePreview />
      </Section>

      <Section title="Sound changes" defaultOpen={false}>
        <div className="change-catalog">
          {CATALOG.map((c) => {
            const enabled = enabledSet.has(c.id);
            const w = config.phonology.changeWeights[c.id] ?? c.baseWeight;
            return (
              <div
                key={c.id}
                className={`change-row ${enabled ? "" : "disabled"}`}
                title={c.description}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setChangeEnabled(c.id, e.target.checked)}
                  aria-label={`${c.label} enabled`}
                />
                <span className="change-label">{c.label}</span>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={0.1}
                  value={w}
                  onChange={(e) => setChangeWeight(c.id, Number(e.target.value))}
                  disabled={!enabled}
                  aria-label={`${c.label} weight`}
                />
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Word genesis rules" defaultOpen={false}>
        <div className="change-catalog">
          {GENESIS_CATALOG.map((g) => {
            const enabled = genesisSet.has(g.id);
            return (
              <div
                key={g.id}
                className={`change-row ${enabled ? "" : "disabled"}`}
                title={g.description}
                style={{ gridTemplateColumns: "auto 1fr" }}
              >
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setGenesisEnabled(g.id, e.target.checked)}
                  aria-label={`${g.label} enabled`}
                />
                <span className="change-label">{g.label}</span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Stats" defaultOpen={false}>
        <StatsPanel />
      </Section>

      <Section title="Export" defaultOpen={false}>
        <ExportButtons />
      </Section>

      <Section title="AI semantic drift" defaultOpen={false}>
        <AiSemantics />
      </Section>

      <Section title="Saved runs" defaultOpen={false}>
        <SavedRunsList />
      </Section>

      {seedEditorOpen && <SeedLexiconEditor onClose={() => setSeedEditorOpen(false)} />}
    </div>
  );
}

function ExportButtons() {
  const state = useSimStore((s) => s.state);
  const config = useSimStore((s) => s.config);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const fileInput = useRef<HTMLInputElement>(null);

  const onImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const snap = await importSnapshot(file);
      loadConfig(snap.config, undefined, snap.state);
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      <button onClick={() => exportLexiconsJSON(state)}>Lexicons JSON</button>
      <button onClick={() => exportLexiconsCSV(state)}>Lexicons CSV</button>
      <button onClick={() => exportTreeNewick(state)}>Tree (Newick)</button>
      <button
        onClick={() => exportSnapshot(config, state)}
        title="Download the entire simulation state + config so you can share or restore it"
      >
        Snapshot ↓
      </button>
      <button onClick={() => fileInput.current?.click()} title="Load a snapshot JSON">
        Snapshot ↑
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        onChange={onImport}
        style={{ display: "none" }}
      />
    </div>
  );
}
