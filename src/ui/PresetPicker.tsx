import { useState, useMemo, useEffect } from "react";
import { useSimStore } from "../state/store";
import { PRESETS } from "../engine/presets";
import {
  loadUserPresets,
  saveUserPreset,
  deleteUserPreset,
  makeUserPresetId,
  type UserPreset,
} from "../persistence/userPresets";

export function PresetPicker() {
  const config = useSimStore((s) => s.config);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const showConfirm = useSimStore((s) => s.showConfirm);

  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const [savingLabel, setSavingLabel] = useState<string>("");
  const [showSave, setShowSave] = useState(false);

  // Refresh user presets on focus (cheap; localStorage is fast).
  useEffect(() => {
    const onFocus = () => setUserPresets(loadUserPresets());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const current = config.preset ?? "default";
  const allOptions = useMemo(
    () => [
      ...PRESETS.map((p) => ({ kind: "builtin" as const, id: p.id, label: p.label, description: p.description })),
      ...userPresets.map((p) => ({ kind: "user" as const, id: p.id, label: p.label, description: p.description })),
    ],
    [userPresets],
  );

  const onChange = async (id: string) => {
    const builtin = PRESETS.find((p) => p.id === id);
    if (builtin) {
      const ok = await showConfirm({
        title: `Load "${builtin.label}"?`,
        message: "This resets the simulation to generation 0 with a new seed lexicon, grammar, and morphology.",
        confirmLabel: "Load preset",
        danger: true,
      });
      if (!ok) return;
      loadConfig(builtin.build());
      return;
    }
    const user = userPresets.find((p) => p.id === id);
    if (user) {
      const ok = await showConfirm({
        title: `Load "${user.label}"?`,
        message: "This resets the simulation to generation 0 with the saved configuration.",
        confirmLabel: "Load preset",
        danger: true,
      });
      if (!ok) return;
      loadConfig(user.config);
    }
  };

  const onSave = () => {
    const label = savingLabel.trim();
    if (!label) return;
    const preset: UserPreset = {
      id: makeUserPresetId(label),
      label,
      description: `Saved from ${config.preset ?? "default"} at ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
      config,
    };
    if (saveUserPreset(preset)) {
      setUserPresets(loadUserPresets());
      setSavingLabel("");
      setShowSave(false);
    }
  };

  const onDelete = async (id: string, label: string) => {
    const ok = await showConfirm({
      title: `Delete "${label}"?`,
      message: "Removes the saved preset from this browser.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteUserPreset(id);
    setUserPresets(loadUserPresets());
  };

  const currentDescription =
    PRESETS.find((p) => p.id === current)?.description ??
    userPresets.find((p) => p.id === current)?.description ??
    "";

  return (
    <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 6 }}>
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
        <optgroup label="Built-in">
          {allOptions
            .filter((o) => o.kind === "builtin")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
        </optgroup>
        {userPresets.length > 0 && (
          <optgroup label="Saved">
            {allOptions
              .filter((o) => o.kind === "user")
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
          </optgroup>
        )}
      </select>
      <div style={{ fontSize: 11, color: "var(--muted)" }}>{currentDescription}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {!showSave ? (
          <button
            type="button"
            className="ghost"
            onClick={() => setShowSave(true)}
            title="Save the current config as a reusable preset"
            style={{ fontSize: 11, padding: "2px 8px" }}
          >
            save current as preset…
          </button>
        ) : (
          <>
            <input
              autoFocus
              type="text"
              value={savingLabel}
              onChange={(e) => setSavingLabel(e.target.value)}
              placeholder="preset name"
              aria-label="Preset name"
              style={{
                flex: 1,
                minWidth: 120,
                padding: "3px 6px",
                fontSize: 11,
                border: "1px solid var(--border)",
                borderRadius: "var(--r-1)",
                background: "var(--panel-2)",
                color: "var(--text)",
              }}
            />
            <button
              type="button"
              className="primary"
              onClick={onSave}
              disabled={!savingLabel.trim()}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              save
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setShowSave(false);
                setSavingLabel("");
              }}
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              cancel
            </button>
          </>
        )}
      </div>
      {userPresets.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
          {userPresets.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                gap: 4,
                fontSize: 11,
                color: "var(--muted)",
                alignItems: "center",
              }}
            >
              <span style={{ flex: 1 }}>{p.label}</span>
              <button
                type="button"
                className="ghost icon-only"
                onClick={() => onDelete(p.id, p.label)}
                title={`Delete ${p.label}`}
                aria-label={`Delete ${p.label}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
