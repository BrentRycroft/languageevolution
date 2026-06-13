import { useState, useMemo, useEffect } from "react";
import { useSimStore } from "../state/store";
import { PRESETS } from "../engine/presets";
import { schedulesForPreset } from "../engine/historical";
import {
  loadUserPresets,
  saveUserPreset,
  deleteUserPreset,
  makeUserPresetId,
  type UserPreset,
} from "../persistence/userPresets";

/**
 * PresetPicker.tsx
 *
 * React app: tabs, controls, lexicon table, narrative panes, grammar view, etc. Key exports: PresetPicker.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function PresetPicker() {
  const config = useSimStore((s) => s.config);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const updateConfig = useSimStore((s) => s.updateConfig);
  const showConfirm = useSimStore((s) => s.showConfirm);

  const [userPresets, setUserPresets] = useState<UserPreset[]>(() => loadUserPresets());
  const [savingLabel, setSavingLabel] = useState<string>("");
  const [showSave, setShowSave] = useState(false);

  // Phase 70 T1: Historical Mode pathway availability for the
  // currently-loaded preset. Empty list = no UI shown.
  const availableSchedules = useMemo(
    () => schedulesForPreset(config.preset),
    [config.preset],
  );
  const historicalOn = !!config.historical?.scheduleId;
  const currentScheduleId = config.historical?.scheduleId;

  // Refresh user presets on focus (cheap; localStorage is fast).
  useEffect(() => {
    const onFocus = () => setUserPresets(loadUserPresets());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const current = config.preset ?? "pie";
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

  // Phase 70 T1: Historical Mode handlers. Toggling is structural —
  // updateConfig flushes to STRUCTURAL_FIELDS and resets the tree.
  const onToggleHistorical = async (next: boolean) => {
    if (next && availableSchedules.length === 0) return;
    if (next === historicalOn) return;
    const ok = await showConfirm({
      title: next ? "Enable Historical Mode?" : "Disable Historical Mode?",
      message: next
        ? "Resets the simulation and softly biases the run along a known historical pathway. The procedural engine still drives every change; the pathway only nudges weights."
        : "Resets the simulation and removes all historical biasing.",
      confirmLabel: next ? "Enable" : "Disable",
      danger: true,
    });
    if (!ok) return;
    if (next) {
      updateConfig({
        historical: {
          scheduleId: availableSchedules[0]!.id,
          intensity: 1.0,
        },
      });
    } else {
      updateConfig({ historical: undefined });
    }
  };

  const onChangeSchedule = async (scheduleId: string) => {
    if (scheduleId === currentScheduleId) return;
    const ok = await showConfirm({
      title: "Switch historical pathway?",
      message: "Resets the simulation to generation 0.",
      confirmLabel: "Switch",
      danger: true,
    });
    if (!ok) return;
    updateConfig({
      historical: {
        scheduleId,
        intensity: config.historical?.intensity ?? 1.0,
      },
    });
  };

  // Phase 70 T4: intensity slider — STRUCTURAL (resets sim) because
  // we keep the whole `historical` object in STRUCTURAL_FIELDS to
  // avoid mid-run intensity changes that would partially apply nudges.
  const onChangeIntensity = async (intensity: number) => {
    if (intensity === (config.historical?.intensity ?? 1.0)) return;
    const ok = await showConfirm({
      title: `Set Historical Mode intensity to ${intensity.toFixed(1)}?`,
      message:
        "Intensity scales every milestone nudge. Changes reset the simulation to generation 0.",
      confirmLabel: "Apply",
      danger: true,
    });
    if (!ok) return;
    updateConfig({
      historical: {
        scheduleId: currentScheduleId,
        intensity,
      },
    });
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
      {availableSchedules.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 4,
            padding: "6px 8px",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              cursor: "pointer",
            }}
            title="Softly bias the run along a known historical pathway. Engine still picks stochastically."
          >
            <input
              type="checkbox"
              checked={historicalOn}
              onChange={(e) => onToggleHistorical(e.target.checked)}
            />
            <span>Historical Mode</span>
          </label>
          {historicalOn && availableSchedules.length > 1 && (
            <select
              value={currentScheduleId ?? availableSchedules[0]!.id}
              onChange={(e) => onChangeSchedule(e.target.value)}
              style={{
                fontSize: 11,
                background: "var(--panel)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 3,
                padding: "3px 6px",
              }}
            >
              {availableSchedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {historicalOn && (
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {
                availableSchedules.find((s) => s.id === currentScheduleId)
                  ?.description
              }
            </div>
          )}
          {historicalOn && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 11,
              }}
              title="Multiplier applied to every milestone nudge. 0=mode neutralised, 1=as-declared, 2=double effect."
            >
              <span style={{ minWidth: 60 }}>Intensity</span>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={config.historical?.intensity ?? 1.0}
                onChange={(e) => onChangeIntensity(Number(e.target.value))}
                style={{ flex: 1 }}
              />
              <span style={{ minWidth: 24, textAlign: "right" }}>
                {(config.historical?.intensity ?? 1.0).toFixed(1)}×
              </span>
            </label>
          )}
        </div>
      )}
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
