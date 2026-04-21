import { useSimStore } from "../state/store";
import { CATALOG } from "../engine/phonology/catalog";
import { GENESIS_CATALOG } from "../engine/genesis/catalog";
import { SavedRunsList } from "./SavedRunsList";
import { StatsPanel } from "./StatsPanel";
import {
  exportLexiconsJSON,
  exportLexiconsCSV,
  exportTreeNewick,
} from "../persistence/export";

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
  const setChangeEnabled = useSimStore((s) => s.setChangeEnabled);
  const setChangeWeight = useSimStore((s) => s.setChangeWeight);
  const setGenesisEnabled = useSimStore((s) => s.setGenesisEnabled);
  const setSeed = useSimStore((s) => s.setSeed);

  const enabledSet = new Set(config.phonology.enabledChangeIds);
  const genesisSet = new Set(config.genesis.enabledRuleIds);

  return (
    <div>
      <div className="section">
        <h4>Playback</h4>
        <Slider
          label="Speed (steps/sec)"
          value={speed}
          min={1}
          max={30}
          step={1}
          onChange={setSpeed}
          format={(v) => `${v}/s`}
        />
      </div>

      <div className="section">
        <h4>Modes</h4>
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
      </div>

      <div className="section">
        <h4>Rates</h4>
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
      </div>

      <div className="section">
        <h4>Seed</h4>
        <input
          type="text"
          value={config.seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="seed"
        />
      </div>

      <div className="section">
        <h4>Sound changes</h4>
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
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h4>Word genesis rules</h4>
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
                />
                <span className="change-label">{g.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="section">
        <h4>Stats</h4>
        <StatsPanel />
      </div>

      <div className="section">
        <h4>Export</h4>
        <ExportButtons />
      </div>

      <div className="section">
        <h4>Saved runs</h4>
        <SavedRunsList />
      </div>
    </div>
  );
}

function ExportButtons() {
  const state = useSimStore((s) => s.state);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      <button onClick={() => exportLexiconsJSON(state)}>Lexicons JSON</button>
      <button onClick={() => exportLexiconsCSV(state)}>Lexicons CSV</button>
      <button onClick={() => exportTreeNewick(state)}>Tree (Newick)</button>
    </div>
  );
}
