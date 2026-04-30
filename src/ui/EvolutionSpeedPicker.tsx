import { useSimStore } from "../state/store";
import { EVOLUTION_SPEEDS, findEvolutionSpeed } from "../engine/presets/speed";

export function EvolutionSpeedPicker() {
  const config = useSimStore((s) => s.config);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const showConfirm = useSimStore((s) => s.showConfirm);

  const current = config.evolutionSpeed ?? "standard";
  const desc = findEvolutionSpeed(current)?.description ?? "";

  const onChange = async (id: string) => {
    const profile = findEvolutionSpeed(id);
    if (!profile || id === current) return;
    const ok = await showConfirm({
      title: `Switch to "${profile.label}"?`,
      message:
        "This resets the simulation to generation 0 because every rate changes.",
      confirmLabel: "Switch",
      danger: true,
    });
    if (!ok) return;
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
