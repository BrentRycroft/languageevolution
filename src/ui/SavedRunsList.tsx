import { useEffect, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import {
  listRuns,
  saveRun,
  deleteRun,
  exportRun,
  importAndSaveRun,
} from "../persistence/storage";
import { downloadAs, slugForFile } from "./exportUtils";
import type { SavedRun } from "../engine/types";

export function SavedRunsList() {
  const config = useSimStore((s) => s.config);
  const state = useSimStore((s) => s.state);
  const loadConfig = useSimStore((s) => s.loadConfig);
  const showConfirm = useSimStore((s) => s.showConfirm);
  const [runs, setRuns] = useState<SavedRun[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const onExport = (r: SavedRun) => {
    downloadAs(`run-${slugForFile(r.label)}.json`, exportRun(r), "application/json");
  };
  const onImportClick = () => fileInputRef.current?.click();
  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const text = await file.text();
    const imported = importAndSaveRun(text);
    if (!imported) {
      await showConfirm({
        title: "Import failed",
        message: "The file isn't a valid saved-run JSON or it failed schema migration.",
        confirmLabel: "OK",
      });
      return;
    }
    refresh();
  };
  const onDelete = async (id: string) => {
    const ok = await showConfirm({
      title: "Delete this run?",
      message: "The saved checkpoint will be removed from your browser. This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteRun(id);
    refresh();
  };

  // Phase 29 Tranche 8f: drag-and-drop a saved-run JSON onto the
  // panel to import. Wires through the same validation + migration
  // path as the Import… button.
  const [isDragOver, setIsDragOver] = useState(false);
  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) setIsDragOver(true);
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDragOver(false);
  };
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const text = await file.text();
    const imported = importAndSaveRun(text);
    if (!imported) {
      await showConfirm({
        title: "Import failed",
        message:
          "The dropped file isn't a valid saved-run JSON or it failed schema migration.",
        confirmLabel: "OK",
      });
      return;
    }
    refresh();
  };

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        outline: isDragOver ? "2px dashed var(--accent)" : "none",
        outlineOffset: 4,
        borderRadius: 6,
      }}
    >
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
        <button
          onClick={onImportClick}
          title="Import a previously exported run JSON (or drag-drop a file onto this panel)"
        >
          Import…
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          style={{ display: "none" }}
          onChange={onImportFile}
        />
      </div>
      <div className="runs-list">
        {runs.length === 0 && (
          <div className="section-empty">
            No runs saved yet.<br />
            Press <strong>Save checkpoint</strong> to capture this one.
          </div>
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
            <button
              onClick={() => onExport(r)}
              title="Download this run as JSON"
              aria-label="Export run"
            >
              ↓
            </button>
            <button onClick={() => onDelete(r.id)} aria-label="Delete run">
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
