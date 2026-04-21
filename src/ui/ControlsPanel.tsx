import { useSimStore } from "../state/store";
import { CATALOG } from "../engine/phonology/catalog";
import { SavedRunsList } from "./SavedRunsList";

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
  const updateAgents = useSimStore((s) => s.updateAgents);
  const updateTree = useSimStore((s) => s.updateTree);
  const setChangeEnabled = useSimStore((s) => s.setChangeEnabled);
  const setChangeWeight = useSimStore((s) => s.setChangeWeight);
  const setSeed = useSimStore((s) => s.setSeed);

  const enabledSet = new Set(config.phonology.enabledChangeIds);

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
          label="Agent communication"
          value={config.modes.agents}
          onChange={(v) => updateModes({ agents: v })}
        />
        <Toggle
          label="Population splits (tree)"
          value={config.modes.tree}
          onChange={(v) => updateModes({ tree: v })}
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
          label="Adoption prob."
          value={config.agents.adoptionProbability}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => updateAgents({ adoptionProbability: v })}
        />
        <Slider
          label="Innovation prob."
          value={config.agents.innovationProbability}
          min={0}
          max={0.2}
          step={0.005}
          onChange={(v) => updateAgents({ innovationProbability: v })}
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
      </div>

      <div className="section">
        <h4>Population</h4>
        <Slider
          label="Size"
          value={config.agents.populationSize}
          min={4}
          max={64}
          step={4}
          onChange={(v) => updateAgents({ populationSize: Math.round(v) })}
          format={(v) => String(Math.round(v))}
        />
        <Slider
          label="Interactions/step"
          value={config.agents.interactionsPerStep}
          min={0}
          max={200}
          step={10}
          onChange={(v) => updateAgents({ interactionsPerStep: Math.round(v) })}
          format={(v) => String(Math.round(v))}
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
        <h4>Saved runs</h4>
        <SavedRunsList />
      </div>
    </div>
  );
}
