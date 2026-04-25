import { useEffect, useState } from "react";
import { useSimStore } from "../state/store";
import { listRuns, saveRun, deleteRun } from "../persistence/storage";
import type { SavedRun } from "../engine/types";

export function SavedRunsList() {
  const config = useSimStore((s) => s.config);
  const state = useSimStore((s) => s.state);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const [runs, setRuns] = useState<SavedRun[]>([]);

  const refresh = () => setRuns(listRuns());
  useEffect(() => {
    refresh();
  }, []);

  const onSaveReplayable = () => {
    const label = prompt(
      "Replayable save — stores config + generation count.",
      `run @ gen ${state.generation}`,
    );
    if (!label) return;
    saveRun(label, config, state.generation);
    refresh();
  };
  const onSaveCheckpoint = () => {
    const label = prompt(
      "Full checkpoint — stores the entire tree state for instant restore.",
      `checkpoint @ gen ${state.generation}`,
    );
    if (!label) return;
    saveRun(label, config, state.generation, state);
    refresh();
  };
  const onLoad = (r: SavedRun) => {
    loadConfig(r.config, r.generationsRun, r.stateSnapshot);
  };
  const onDelete = (id: string) => {
    if (!confirm("Delete this run?")) return;
    deleteRun(id);
    refresh();
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={onSaveReplayable} title="Save config + gen count (replays from seed)">
          Save replayable
        </button>
        <button
          onClick={onSaveCheckpoint}
          title="Save full tree state (instant restore, larger storage)"
        >
          Save checkpoint
        </button>
      </div>
      <div className="runs-list">
        {runs.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 11 }}>No saved runs.</div>
        )}
        {runs.map((r) => (
          <div key={r.id} className="run-row">
            <span className="label" title={`gen ${r.generationsRun}`}>
              {r.label}{" "}
              <span className="t-muted">
                (g{r.generationsRun}{r.stateSnapshot ? "✓" : ""})
              </span>
            </span>
            <button onClick={() => onLoad(r)}>Load</button>
            <button onClick={() => onDelete(r.id)} aria-label="Delete run">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
