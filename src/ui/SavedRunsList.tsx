import { useEffect, useState } from "react";
import { useSimStore } from "../state/store";
import { listRuns, saveRun, deleteRun } from "../persistence/storage";
import type { SavedRun } from "../engine/types";

export function SavedRunsList() {
  const config = useSimStore((s) => s.config);
  const generation = useSimStore((s) => s.state.generation);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const [runs, setRuns] = useState<SavedRun[]>([]);

  const refresh = () => setRuns(listRuns());
  useEffect(() => {
    refresh();
  }, []);

  const onSave = () => {
    const label = prompt("Label for this run?", `run @ gen ${generation}`);
    if (!label) return;
    saveRun(label, config, generation);
    refresh();
  };
  const onLoad = (r: SavedRun) => {
    loadConfig(r.config, r.generationsRun);
  };
  const onDelete = (id: string) => {
    if (!confirm("Delete this run?")) return;
    deleteRun(id);
    refresh();
  };

  return (
    <div>
      <button onClick={onSave}>Save current run</button>
      <div className="runs-list">
        {runs.length === 0 && (
          <div style={{ color: "var(--muted)", fontSize: 11 }}>No saved runs.</div>
        )}
        {runs.map((r) => (
          <div key={r.id} className="run-row">
            <span className="label" title={`gen ${r.generationsRun}`}>
              {r.label}{" "}
              <span style={{ color: "var(--muted)" }}>(g{r.generationsRun})</span>
            </span>
            <button onClick={() => onLoad(r)}>Load</button>
            <button onClick={() => onDelete(r.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
