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

export function buildGrammarBrief(
  state: SimulationState,
  langId: string,
): string {
  const node = state.tree[langId];
  if (!node) return "";
  const lang = node.language;
  const lines: string[] = [];

  lines.push(`# ${lang.name} — grammar brief`);
  lines.push("");
  lines.push(`- **Generation**: ${state.generation}`);
  lines.push(`- **Age**: ${state.generation - lang.birthGeneration} gens`);
  lines.push(`- **Conservatism**: ${lang.conservatism.toFixed(2)}`);
  lines.push(`- **Lexicon size**: ${Object.keys(lang.lexicon).length}`);
  if (lang.extinct) {
    lines.push(`- **Extinct** at gen ${lang.deathGeneration ?? "?"}`);
  }
  lines.push("");

  lines.push("## Grammar features");
  for (const [k, v] of Object.entries(lang.grammar)) {
    lines.push(`- **${k}**: ${String(v)}`);
  }
  lines.push("");

  lines.push("## Phoneme inventory");
  lines.push(`- **Segmental** (${lang.phonemeInventory.segmental.length}): \`${lang.phonemeInventory.segmental.join(" ")}\``);
  if (lang.phonemeInventory.usesTones) {
    lines.push(`- **Tones**: \`${lang.phonemeInventory.tones.join(" ")}\``);
  }
  lines.push("");

  const active = lang.activeRules ?? [];
  lines.push(`## Active sound laws (${active.length})`);
  if (active.length === 0) {
    lines.push("_(no procedural rules have landed yet)_");
  } else {
    lines.push("| family | rule | description | strength | age |");
    lines.push("|---|---|---|---|---|");
    for (const r of active.slice().sort((a, b) => b.strength - a.strength)) {
      const shortId = r.id.split(".").slice(2).join(".") || r.id;
      lines.push(
        `| ${r.family} | ${shortId} | ${r.description} | ${r.strength.toFixed(2)} | ${state.generation - r.birthGeneration} |`,
      );
    }
  }
  lines.push("");

  const retired = lang.retiredRules ?? [];
  if (retired.length > 0) {
    lines.push(`## Retired sound laws (${retired.length})`);
    lines.push("| family | rule | born | died |");
    lines.push("|---|---|---|---|");
    for (const r of retired
      .slice()
      .sort((a, b) => (b.deathGeneration ?? 0) - (a.deathGeneration ?? 0))
      .slice(0, 20)) {
      const shortId = r.id.split(".").slice(2).join(".") || r.id;
      lines.push(
        `| ${r.family} | ${shortId} | ${r.birthGeneration} | ${r.deathGeneration ?? "-"} |`,
      );
    }
    lines.push("");
  }

  const buckets: Record<string, string[]> = {
    metonymy: [],
    metaphor: [],
    narrowing: [],
    broadening: [],
  };
  for (const e of lang.events) {
    if (e.kind !== "semantic_drift") continue;
    const prefix = e.description.split(":")[0]!.trim();
    if (buckets[prefix]) {
      buckets[prefix]!.push(`gen ${e.generation}: ${e.description}`);
    }
  }
  const driftTotal = Object.values(buckets).reduce((n, xs) => n + xs.length, 0);
  if (driftTotal > 0) {
    lines.push(`## Semantic drift (${driftTotal} events)`);
    for (const [name, items] of Object.entries(buckets)) {
      if (items.length === 0) continue;
      lines.push(`### ${name} (${items.length})`);
      for (const it of items.slice(-8)) lines.push(`- ${it}`);
      lines.push("");
    }
  }

  const register = lang.registerOf ?? {};
  const registerEntries = Object.entries(register);
  if (registerEntries.length > 0) {
    const high = registerEntries.filter(([, v]) => v === "high");
    const low = registerEntries.filter(([, v]) => v === "low");
    lines.push(`## Register`);
    lines.push(`- **High** (${high.length}): ${high.map(([k]) => k).join(", ") || "—"}`);
    lines.push(`- **Low** (${low.length}): ${low.map(([k]) => k).join(", ") || "—"}`);
    lines.push("");
  }

  lines.push("## OT ranking");
  lines.push(lang.otRanking.map((c, i) => `${i + 1}. ${c}`).join("\n"));
  lines.push("");

  lines.push(`_Generated by the Language Evolution simulator at gen ${state.generation}._`);
  return lines.join("\n");
}

export function exportGrammarBrief(
  state: SimulationState,
  langId: string,
): void {
  const md = buildGrammarBrief(state, langId);
  if (!md) return;
  const lang = state.tree[langId]!.language;
  const safe = lang.name.replace(/\s+/g, "_");
  triggerDownload(
    `grammar-brief-${safe}-gen${state.generation}.md`,
    md,
    "text/markdown",
  );
}
