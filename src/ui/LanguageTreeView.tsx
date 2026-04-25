import { useMemo, useRef, useEffect, useState } from "react";
import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { useSimStore } from "../state/store";
import { formatForm, type DisplayScript } from "../engine/phonology/display";
import type { LanguageTree } from "../engine/types";
import { ScriptPicker } from "./ScriptPicker";
import { StemmaView } from "./StemmaView";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";

type TreeMode = "phylogeny" | "stemma";

interface NodeDatum {
  id: string;
  name: string;
  sample: string;
  isLeaf: boolean;
  extinct: boolean;
  /** Multi-line tooltip shown via SVG <title>. */
  tooltip: string;
  children?: NodeDatum[];
}

function buildTooltip(
  tree: LanguageTree,
  id: string,
  generation: number,
  script: DisplayScript,
  yearsPerGen: number = YEARS_PER_GENERATION,
): string {
  const node = tree[id]!;
  const lang = node.language;
  const age = generation - lang.birthGeneration;
  const tempo = lang.conservatism >= 1.3 ? "🐢" : lang.conservatism <= 0.7 ? "🐇" : "⏱";
  const lexCount = Object.keys(lang.lexicon).length;
  const borrowCount = Object.values(lang.wordOrigin ?? {}).filter((o) =>
    o.startsWith("borrow:"),
  ).length;
  const samples = ["water", "fire", "mother", "go", "see", "king"]
    .map((m) => {
      const f = lang.lexicon[m];
      return f ? `${m}=${formatForm(f, lang, script)}` : null;
    })
    .filter(Boolean)
    .slice(0, 3)
    .join("\n  ");
  return [
    lang.name + (lang.extinct ? " (extinct)" : ""),
    `age ${formatElapsed(age, yearsPerGen)} · ${lexCount} words · ${tempo} ${lang.conservatism.toFixed(2)}`,
    borrowCount > 0 ? `${borrowCount} loanwords` : "",
    samples ? "  " + samples : "",
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
    // Vertical layout: x spreads horizontally, y is depth downward.
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
      <svg className="tree-svg" width={size.w} height={size.h}>
        <g transform={`translate(${layout.margin},${layout.margin})`}>
          {layout.root.links().map((link, i) => {
            const s = link.source as unknown as { x: number; y: number };
            const t = link.target as unknown as { x: number; y: number };
            const targetExtinct = (link.target.data as NodeDatum).extinct;
            // Vertical orientation: route via midpoint Y.
            const midY = (s.y + t.y) / 2;
            const path = `M${s.x},${s.y} C${s.x},${midY} ${t.x},${midY} ${t.x},${t.y}`;
            return (
              <path
                key={i}
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
            // Labels drop BELOW node for leaves (room), ABOVE for internals.
            const labelY = d.isLeaf ? 18 : -10;
            const sampleY = d.isLeaf ? 30 : -22;
            return (
              <g key={d.id} transform={`translate(${pos.x},${pos.y})`}>
                <title>{d.tooltip}</title>
                <circle
                  r={d.isLeaf ? 7 : 4}
                  className={`tree-node-circle ${cls}`}
                  onClick={() => selectLanguage(d.id)}
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
      )}
    </div>
  );
}
