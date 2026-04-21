import { useSimStore } from "../state/store";
import { PRESETS } from "../engine/presets";

export function PresetPicker() {
  const config = useSimStore((s) => s.config);
  const loadConfig = useSimStore((s) => s.loadConfig);

  const current = config.preset ?? "default";

  const onChange = (id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    if (
      !confirm(
        `Load "${preset.label}"? This resets the simulation to generation 0 with a new seed lexicon, grammar, and morphology.`,
      )
    )
      return;
    loadConfig(preset.build());
  };

  return (
    <div style={{ fontSize: 12 }}>
      <select
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
        {PRESETS.map((p) => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </select>
      <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
        {PRESETS.find((p) => p.id === current)?.description ?? ""}
      </div>
    </div>
  );
}
