import { useSimStore } from "../state/store";
import { EVOLUTION_SPEEDS, findEvolutionSpeed } from "../engine/presets/speed";

export function EvolutionSpeedPicker() {
  const config = useSimStore((s) => s.config);
  const loadConfig = useSimStore((s) => s.loadConfig);

  const current = config.evolutionSpeed ?? "standard";
  const desc = findEvolutionSpeed(current)?.description ?? "";

  const onChange = (id: string) => {
    const profile = findEvolutionSpeed(id);
    if (!profile || id === current) return;
    // Switching evolution speed changes every rate and therefore has to
    // restart the simulation. Confirm so users don't lose their current run.
    if (
      !confirm(
        `Switch to "${profile.label}"?\nThis resets the simulation to generation 0 because every rate changes.`,
      )
    ) {
      return;
    }
    const next = profile.apply(config);
    loadConfig({ ...next, evolutionSpeed: id });
  };

  return (
    <div style={{ fontSize: 12 }}>
      <select
        aria-label="Evolution speed"
        value={current}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          background: "var(--panel-2)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "5px 8px",
        }}
      >
        {EVOLUTION_SPEEDS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        {desc}
      </div>
    </div>
  );
}
