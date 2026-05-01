import { useMemo, useRef, useEffect, useState } from "react";
import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { useSimStore } from "../state/store";
import { formatForm, type DisplayScript } from "../engine/phonology/display";
import type { LanguageTree } from "../engine/types";
import { ScriptPicker } from "./ScriptPicker";
import { StemmaView } from "./StemmaView";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";
import { reconstructProtoLexicon, type ReconstructedForm } from "../engine/tree/reconstruction";

type TreeMode = "phylogeny" | "stemma";

interface TooltipData {
  name: string;
  extinct: boolean;
  ageLabel: string;
  conservatism: number;
  conservatismIcon: string;
  lexCount: number;
  borrowCount: number;
  samples: Array<{ meaning: string; form: string }>;
  reconstructed?: Array<{ meaning: string; form: string; confidence: number }>;
  descendantCount?: number;
}

interface NodeDatum {
  id: string;
  name: string;
  sample: string;
  isLeaf: boolean;
  extinct: boolean;
  tooltip: TooltipData;
  children?: NodeDatum[];
}

const RECONSTRUCTION_TARGETS = [
  "water", "fire", "mother", "father", "i", "you", "two", "see",
  "go", "eat", "stone", "tree",
];

function buildTooltip(
  tree: LanguageTree,
  id: string,
  generation: number,
  script: DisplayScript,
  yearsPerGen: number = YEARS_PER_GENERATION,
): TooltipData {
  const node = tree[id]!;
  const lang = node.language;
  const age = generation - lang.birthGeneration;
  const conservatismIcon = lang.conservatism >= 1.3 ? "🐢" : lang.conservatism <= 0.7 ? "🐇" : "⏱";
  const lexCount = Object.keys(lang.lexicon).length;
  const borrowCount = Object.values(lang.wordOrigin ?? {}).filter((o) =>
    o.startsWith("borrow:"),
  ).length;
  const samples: Array<{ meaning: string; form: string }> = [];
  for (const m of ["water", "fire", "mother", "go", "see", "king"]) {
    const f = lang.lexicon[m];
    if (f) samples.push({ meaning: m, form: formatForm(f, lang, script, m) });
    if (samples.length >= 3) break;
  }
  const isInternal = node.childrenIds.length > 0;
  let reconstructed: TooltipData["reconstructed"];
  let descendantCount: number | undefined;
  if (isInternal) {
    const items = reconstructProtoLexicon(tree, id, RECONSTRUCTION_TARGETS);
    items.sort((a, b) => b.confidence - a.confidence);
    const top = items.slice(0, 5);
    reconstructed = top.map((r: ReconstructedForm) => ({
      meaning: r.meaning,
      form: formatForm(r.form, lang, script, r.meaning),
      confidence: r.confidence,
    }));
    descendantCount = top[0]?.totalDescendants;
  }
  return {
    name: lang.name,
    extinct: !!lang.extinct,
    ageLabel: formatElapsed(age, yearsPerGen),
    conservatism: lang.conservatism,
    conservatismIcon,
    lexCount,
    borrowCount,
    samples,
    reconstructed,
    descendantCount,
  };
}

function tooltipToString(t: TooltipData): string {
  return [
    t.name + (t.extinct ? " (extinct)" : ""),
    `age ${t.ageLabel} · ${t.lexCount} words · ${t.conservatismIcon} ${t.conservatism.toFixed(2)}`,
    t.borrowCount > 0 ? `${t.borrowCount} loanwords` : "",
    t.samples.length > 0
      ? "  " + t.samples.map((s) => `${s.meaning}=${s.form}`).join(", ")
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildHierarchy(
  tree: LanguageTree,
  rootId: string,
  sampleMeaning: string,
  generation: number,
  script: DisplayScript,
  yearsPerGen: number = YEARS_PER_GENERATION,
): NodeDatum {
  const build = (id: string): NodeDatum => {
    const node = tree[id]!;
    const lang = node.language;
    const form = lang.lexicon[sampleMeaning];
    return {
      id,
      name: lang.name,
      sample: form ? formatForm(form, lang, script) : "—",
      isLeaf: node.childrenIds.length === 0,
      extinct: !!lang.extinct,
      tooltip: buildTooltip(tree, id, generation, script, yearsPerGen),
      children: node.childrenIds.length
        ? node.childrenIds.map((cid) => build(cid))
        : undefined,
    };
  };
  return build(rootId);
}

export function LanguageTreeView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectLanguage = useSimStore((s) => s.selectLanguage);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);
  const script = useSimStore((s) => s.displayScript);
  const yearsPerGen = useSimStore(
    (s) => s.config.yearsPerGeneration ?? YEARS_PER_GENERATION,
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: 400 });
  const [mode, setMode] = useState<TreeMode>("phylogeny");
  const [hovered, setHovered] = useState<{
    id: string;
    data: TooltipData;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    const sample = selectedMeaning ?? "water";
    const data = buildHierarchy(state.tree, state.rootId, sample, state.generation, script, yearsPerGen);
    const root = hierarchy(data);
    const margin = 24;
    const w = Math.max(200, size.w - margin * 2);
    const h = Math.max(160, size.h - margin * 2 - 20);
    d3tree<NodeDatum>().size([w, h]).separation(() => 1.2)(root);
    return { root, margin };
  }, [state, selectedMeaning, size, script]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 220 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 0 4px",
          gap: 8,
        }}
      >
        <div role="tablist" aria-label="Tree mode" className="row-4">
          <button
            role="tab"
            aria-selected={mode === "phylogeny"}
            className={mode === "phylogeny" ? "active" : ""}
            onClick={() => setMode("phylogeny")}
            title="Parent / child split history"
          >
            Phylogeny
          </button>
          <button
            role="tab"
            aria-selected={mode === "stemma"}
            className={mode === "stemma" ? "active" : ""}
            onClick={() => setMode("stemma")}
            title="Cluster languages by shared procedural rules — reveals areal convergence"
          >
            Rule similarity
          </button>
        </div>
        <ScriptPicker />
      </div>
      {mode === "stemma" ? (
        <StemmaView />
      ) : (
      <div style={{ position: "relative" }}>
      <svg className="tree-svg" width={size.w} height={size.h}>
        <g transform={`translate(${layout.margin},${layout.margin})`}>
          {layout.root.links().map((link) => {
            const s = link.source as unknown as { x: number; y: number };
            const t = link.target as unknown as { x: number; y: number };
            const sourceData = link.source.data as NodeDatum;
            const targetData = link.target.data as NodeDatum;
            const targetExtinct = targetData.extinct;
            const midY = (s.y + t.y) / 2;
            const path = `M${s.x},${s.y} C${s.x},${midY} ${t.x},${midY} ${t.x},${t.y}`;
            return (
              <path
                key={`${sourceData.id}->${targetData.id}`}
                className="tree-link"
                d={path}
                strokeDasharray={targetExtinct ? "4 4" : undefined}
                opacity={targetExtinct ? 0.5 : 1}
              />
            );
          })}
          {layout.root.descendants().map((n) => {
            const d = n.data;
            const pos = n as unknown as { x: number; y: number };
            const cls =
              (d.isLeaf ? "leaf" : "internal") +
              (d.extinct ? " extinct" : "") +
              (selectedLangId === d.id ? " selected" : "");
            const labelY = d.isLeaf ? 18 : -10;
            const sampleY = d.isLeaf ? 30 : -22;
            return (
              <g key={d.id} transform={`translate(${pos.x},${pos.y})`}>
                <circle
                  r={d.isLeaf ? 7 : 4}
                  className={`tree-node-circle ${cls}`}
                  onClick={() => selectLanguage(d.id)}
                  onMouseEnter={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    setHovered({
                      id: d.id,
                      data: d.tooltip,
                      x: e.clientX - (rect?.left ?? 0),
                      y: e.clientY - (rect?.top ?? 0),
                    });
                  }}
                  onMouseMove={(e) => {
                    const rect = containerRef.current?.getBoundingClientRect();
                    setHovered((h) =>
                      h && h.id === d.id
                        ? {
                            ...h,
                            x: e.clientX - (rect?.left ?? 0),
                            y: e.clientY - (rect?.top ?? 0),
                          }
                        : h,
                    );
                  }}
                  onMouseLeave={() =>
                    setHovered((h) => (h && h.id === d.id ? null : h))
                  }
                  aria-label={tooltipToString(d.tooltip)}
                />
                {d.extinct && (
                  <g pointerEvents="none" stroke="var(--danger)" strokeWidth={2}>
                    <line x1={-6} y1={-6} x2={6} y2={6} />
                    <line x1={-6} y1={6} x2={6} y2={-6} />
                  </g>
                )}
                <text
                  className="tree-node-label"
                  x={0}
                  y={labelY}
                  textAnchor="middle"
                  opacity={d.extinct ? 0.5 : 1}
                >
                  {d.name}
                </text>
                <text
                  className="tree-node-sample"
                  x={0}
                  y={sampleY}
                  textAnchor="middle"
                  opacity={d.extinct ? 0.4 : 1}
                >
                  {d.sample}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      {hovered && <TreeNodeHover x={hovered.x} y={hovered.y} data={hovered.data} />}
      </div>
      )}
    </div>
  );
}

function TreeNodeHover({
  x,
  y,
  data,
}: {
  x: number;
  y: number;
  data: TooltipData;
}) {
  const left = x + 14;
  const top = y + 14;
  return (
    <div
      className="tree-node-hover"
      style={{ left, top }}
      role="tooltip"
      aria-hidden="true"
    >
      <div className="tree-node-hover-header">
        <span className="tree-node-hover-name">{data.name}</span>
        {data.extinct && <span className="tree-node-hover-extinct">extinct</span>}
      </div>
      <div className="tree-node-hover-stats">
        <span title="age">⏳ {data.ageLabel}</span>
        <span title="conservatism">
          {data.conservatismIcon} {data.conservatism.toFixed(2)}
        </span>
        <span title="lexicon size">📖 {data.lexCount}</span>
        {data.borrowCount > 0 && (
          <span title="loanwords">↪ {data.borrowCount}</span>
        )}
      </div>
      {data.samples.length > 0 && (
        <div className="tree-node-hover-samples">
          {data.samples.map((s) => (
            <span key={s.meaning} className="tree-node-hover-chip">
              <span className="tree-node-hover-chip-meaning">{s.meaning}</span>
              <span className="tree-node-hover-chip-form">{s.form}</span>
            </span>
          ))}
        </div>
      )}
      {data.reconstructed && data.reconstructed.length > 0 && (
        <div className="tree-node-hover-reconstruction">
          <div className="tree-node-hover-reconstruction-header">
            ⌬ reconstructed proto (from {data.descendantCount ?? "?"} descendants)
          </div>
          <div className="tree-node-hover-samples">
            {data.reconstructed.map((r) => (
              <span key={r.meaning} className="tree-node-hover-chip" title={`confidence ${(r.confidence * 100).toFixed(0)}%`}>
                <span className="tree-node-hover-chip-meaning">*{r.meaning}</span>
                <span className="tree-node-hover-chip-form">{r.form}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
