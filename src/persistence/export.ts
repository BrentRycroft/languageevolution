import type { LanguageTree, SimulationState } from "../engine/types";
import { leafIds } from "../engine/tree/split";
import { formToString, sanitizeForNewick } from "../engine/phonology/ipa";

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportLexiconsJSON(state: SimulationState): void {
  const leaves = leafIds(state.tree);
  const out: Record<string, Record<string, string>> = {};
  for (const id of leaves) {
    const lang = state.tree[id]!.language;
    out[lang.name] = {};
    for (const m of Object.keys(lang.lexicon).sort()) {
      out[lang.name]![m] = formToString(lang.lexicon[m]!);
    }
  }
  const data = JSON.stringify(
    { generation: state.generation, lexicons: out },
    null,
    2,
  );
  triggerDownload(`lexicons-gen${state.generation}.json`, data, "application/json");
}

export function exportLexiconsCSV(state: SimulationState): void {
  const leaves = leafIds(state.tree);
  const meanings = new Set<string>();
  for (const id of leaves) {
    for (const m of Object.keys(state.tree[id]!.language.lexicon)) meanings.add(m);
  }
  const sortedMeanings = Array.from(meanings).sort();
  const header = ["meaning", ...leaves.map((id) => state.tree[id]!.language.name)];
  const rows: string[] = [header.join(",")];
  for (const m of sortedMeanings) {
    const cells = [m];
    for (const id of leaves) {
      const form = state.tree[id]!.language.lexicon[m];
      cells.push(form ? formToString(form) : "");
    }
    rows.push(cells.map((c) => JSON.stringify(c)).join(","));
  }
  triggerDownload(
    `lexicons-gen${state.generation}.csv`,
    rows.join("\n"),
    "text/csv",
  );
}

function toNewick(tree: LanguageTree, id: string): string {
  const node = tree[id]!;
  const label = sanitizeForNewick(node.language.name);
  if (node.childrenIds.length === 0) return label;
  const children = node.childrenIds.map((cid) => toNewick(tree, cid)).join(",");
  return `(${children})${label}`;
}

export function exportTreeNewick(state: SimulationState): void {
  const nwk = toNewick(state.tree, state.rootId) + ";";
  triggerDownload(`tree-gen${state.generation}.nwk`, nwk, "text/plain");
}

export interface SnapshotPayload {
  version: 1;
  exportedAt: string;
  config: import("../engine/types").SimulationConfig;
  state: SimulationState;
}

export function exportSnapshot(
  config: import("../engine/types").SimulationConfig,
  state: SimulationState,
): void {
  const payload: SnapshotPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    config,
    state,
  };
  triggerDownload(
    `lev-snapshot-gen${state.generation}.json`,
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

export async function importSnapshot(file: File): Promise<SnapshotPayload> {
  const text = await file.text();
  const parsed = JSON.parse(text) as SnapshotPayload;
  if (!parsed || parsed.version !== 1 || !parsed.config || !parsed.state) {
    throw new Error("Snapshot file is missing version/config/state.");
  }
  return parsed;
}
