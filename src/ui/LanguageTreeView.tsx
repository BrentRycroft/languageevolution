import { useMemo, useRef, useEffect, useState } from "react";
import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { useSimStore } from "../state/store";
import { formToString } from "../engine/phonology/ipa";
import type { LanguageTree } from "../engine/types";

interface NodeDatum {
  id: string;
  name: string;
  sample: string;
  isLeaf: boolean;
  children?: NodeDatum[];
}

function buildHierarchy(tree: LanguageTree, rootId: string, sampleMeaning: string): NodeDatum {
  const build = (id: string): NodeDatum => {
    const node = tree[id]!;
    const lang = node.language;
    const form = lang.lexicon[sampleMeaning];
    return {
      id,
      name: lang.name,
      sample: form ? formToString(form) : "—",
      isLeaf: node.childrenIds.length === 0,
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

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 600, h: 400 });

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
    const data = buildHierarchy(state.tree, state.rootId, sample);
    const root = hierarchy(data);
    const margin = 20;
    const w = Math.max(200, size.w - margin * 2);
    const h = Math.max(160, size.h - margin * 2 - 20);
    d3tree<NodeDatum>().size([h, w]).separation(() => 1.1)(root);
    return { root, margin };
  }, [state, selectedMeaning, size]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 200 }}>
      <svg className="tree-svg" width={size.w} height={size.h}>
        <g transform={`translate(${layout.margin},${layout.margin})`}>
          {layout.root.links().map((link, i) => {
            const s = link.source as unknown as { x: number; y: number };
            const t = link.target as unknown as { x: number; y: number };
            const mid = (s.y + t.y) / 2;
            const path = `M${s.y},${s.x} C${mid},${s.x} ${mid},${t.x} ${t.y},${t.x}`;
            return <path key={i} className="tree-link" d={path} />;
          })}
          {layout.root.descendants().map((n) => {
            const d = n.data;
            const pos = n as unknown as { x: number; y: number };
            const cls =
              (d.isLeaf ? "leaf" : "internal") +
              (selectedLangId === d.id ? " selected" : "");
            return (
              <g key={d.id} transform={`translate(${pos.y},${pos.x})`}>
                <circle
                  r={d.isLeaf ? 7 : 4}
                  className={`tree-node-circle ${cls}`}
                  onClick={() => selectLanguage(d.id)}
                />
                <text
                  className="tree-node-label"
                  x={d.isLeaf ? 11 : 7}
                  y={-2}
                >
                  {d.name}
                </text>
                <text
                  className="tree-node-sample"
                  x={d.isLeaf ? 11 : 7}
                  y={11}
                >
                  {d.sample}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
