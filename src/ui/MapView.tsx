import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { getWorldMap, type MapCell, type WorldMap } from "../engine/geo/map";
import { fnv1a } from "../engine/rng";
import { formatForm } from "../engine/phonology/display";
import { TIER_LABELS } from "../engine/lexicon/concepts";
import type { Language, LanguageNode, LanguageTree } from "../engine/types";

/**
 * Voronoi-cell-based world map. Replaces the old centroid-only
 * MapView. Each language holds a contiguous set of map cells
 * (`lang.territory.cells`); we colour each cell by its owner's
 * id-hash hue, dim it for extinct languages, render ocean cells
 * blue, and draw an isogloss stroke between cells whose owners
 * differ. Pan + zoom via SVG viewBox manipulation.
 */
export function MapView() {
  const state = useSimStore((s) => s.state);
  const config = useSimStore((s) => s.config);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectLanguage = useSimStore((s) => s.selectLanguage);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);
  const script = useSimStore((s) => s.displayScript);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 600, h: 400 });
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });

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

  // World map for the active sim. Memoised by mode + seed (the
  // generator is itself memoised internally too).
  const worldMap = useMemo(
    () => getWorldMap(config.mapMode ?? "random", config.seed),
    [config.mapMode, config.seed],
  );

  // Ownership map: cellId → languageId. Built once per render.
  const ownership = useMemo(() => buildOwnership(state.tree), [state.tree]);

  // Fit viewBox to map bounds.
  const pad = 40;
  const fitScale = Math.min(
    (size.w - pad * 2) / (worldMap.bounds.maxX - worldMap.bounds.minX),
    (size.h - pad * 2) / (worldMap.bounds.maxY - worldMap.bounds.minY),
  );
  const scale = Math.max(0.05, Math.min(20, fitScale * view.zoom));
  const cx = (worldMap.bounds.minX + worldMap.bounds.maxX) / 2;
  const cy = (worldMap.bounds.minY + worldMap.bounds.maxY) / 2;
  const project = (x: number, y: number) => ({
    px: (x - cx) * scale + size.w / 2 + view.x,
    py: (y - cy) * scale + size.h / 2 + view.y,
  });

  // Drag-to-pan
  const drag = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    setView((v) => ({ ...v, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setView((v) => ({ ...v, zoom: Math.max(0.4, Math.min(8, v.zoom * factor)) }));
  };

  // Pre-compute fill colours per cell so repaints don't recompute.
  const cellFills = useMemo(() => {
    const out: string[] = new Array(worldMap.cells.length);
    for (let i = 0; i < worldMap.cells.length; i++) {
      const cell = worldMap.cells[i]!;
      if (cell.biome === "ocean") {
        out[i] = "#1d3a55"; // deep blue
        continue;
      }
      const ownerId = ownership[cell.id];
      if (ownerId) {
        const lang = state.tree[ownerId]?.language;
        if (lang) {
          out[i] = languageColor(ownerId, lang.extinct ?? false, (lang.culturalTier ?? 0));
          continue;
        }
      }
      // Unowned land → biome-tinted neutral.
      out[i] = biomeColor(cell.biome);
    }
    return out;
  }, [worldMap, ownership, state.tree]);

  // Tooltip state.
  const [hoverCell, setHoverCell] = useState<number | null>(null);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 320, position: "relative" }}
    >
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          background: "#0f1f2e",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2)",
          cursor: drag.current ? "grabbing" : "grab",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* Cells. */}
        {worldMap.cells.map((cell, i) => (
          <MapCellShape
            key={cell.id}
            cell={cell}
            fill={cellFills[i]!}
            ownerId={ownership[cell.id]}
            ownership={ownership}
            project={project}
            onHover={setHoverCell}
            onClick={(langId) => {
              if (langId) selectLanguage(langId);
            }}
            isOwnerSelected={
              ownership[cell.id] !== undefined &&
              ownership[cell.id] === selectedLangId
            }
          />
        ))}
        {/* Language name labels — one per alive leaf at its centroid. */}
        {labelsForAliveLeaves(state.tree, worldMap).map(({ langId, lang, point }) => {
          const { px, py } = project(point.x, point.y);
          const sample =
            selectedMeaning && lang.lexicon[selectedMeaning]
              ? formatForm(lang.lexicon[selectedMeaning]!, lang, script)
              : "";
          return (
            <g
              key={langId}
              transform={`translate(${px},${py})`}
              pointerEvents="none"
              opacity={lang.extinct ? 0.4 : 1}
            >
              <text
                textAnchor="middle"
                fontSize={11}
                fontFamily="var(--font-mono)"
                fill="white"
                stroke="rgba(0,0,0,0.7)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                {lang.name}
              </text>
              {sample && (
                <text
                  y={12}
                  textAnchor="middle"
                  fontSize={9}
                  fontFamily="var(--font-mono)"
                  fill="rgba(255,255,255,0.85)"
                  stroke="rgba(0,0,0,0.7)"
                  strokeWidth={3}
                  paintOrder="stroke"
                >
                  {sample}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Hover tooltip pinned to the corner — simpler than a tracking
          tooltip and works on touch. */}
      {hoverCell !== null && (
        <div
          style={{
            position: "absolute",
            left: 8,
            top: 8,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
            padding: 8,
            fontSize: "var(--fs-1)",
            maxWidth: 240,
            color: "var(--text)",
            pointerEvents: "none",
          }}
        >
          {renderCellTooltip(hoverCell, worldMap, ownership, state.tree, selectedMeaning, script)}
        </div>
      )}

      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 10,
          display: "flex",
          gap: 6,
          fontSize: "var(--fs-1)",
          color: "var(--muted)",
          background: "var(--panel)",
          padding: "4px 8px",
          borderRadius: "var(--r-pill)",
          border: "1px solid var(--border)",
          pointerEvents: "none",
        }}
      >
        {worldMap.kind} · drag to pan · scroll to zoom · {view.zoom.toFixed(2)}×
      </div>
    </div>
  );
}

interface CellShapeProps {
  cell: MapCell;
  fill: string;
  ownerId: string | undefined;
  ownership: Record<number, string>;
  project: (x: number, y: number) => { px: number; py: number };
  onHover: (id: number | null) => void;
  onClick: (langId: string | undefined) => void;
  isOwnerSelected: boolean;
}

function MapCellShape({
  cell,
  fill,
  ownerId,
  ownership,
  project,
  onHover,
  onClick,
  isOwnerSelected,
}: CellShapeProps) {
  if (cell.vertices.length < 3) return null;
  const points = cell.vertices
    .map((v) => {
      const p = project(v.x, v.y);
      return `${p.px},${p.py}`;
    })
    .join(" ");
  // Isogloss thickness: thicker when the cell's neighbours have
  // different owners (or the cell is on the ocean / land boundary).
  let isoglossEdges = 0;
  for (const n of cell.neighbours) {
    if (ownership[n] !== ownerId) isoglossEdges++;
  }
  const stroke = isOwnerSelected ? "var(--accent-2)" : "rgba(0,0,0,0.4)";
  const strokeWidth = isOwnerSelected ? 2.5 : isoglossEdges > 0 ? 0.6 : 0.2;
  return (
    <polygon
      points={points}
      fill={fill}
      stroke={stroke}
      strokeWidth={strokeWidth}
      onPointerEnter={() => onHover(cell.id)}
      onPointerLeave={() => onHover(null)}
      onClick={() => onClick(ownerId)}
      style={{ cursor: ownerId ? "pointer" : "default" }}
    />
  );
}

function buildOwnership(tree: LanguageTree): Record<number, string> {
  const out: Record<number, string> = {};
  for (const id of Object.keys(tree)) {
    const lang = tree[id]!.language;
    const cells = lang.territory?.cells;
    if (!cells || cells.length === 0) continue;
    // Alive leaves and extinct leaves can both own cells; but if
    // multiple claim the same cell (during a transition), the alive
    // one wins.
    for (const c of cells) {
      const existing = out[c];
      if (!existing) {
        out[c] = id;
        continue;
      }
      const existingLang = tree[existing]!.language;
      if (existingLang.extinct && !lang.extinct) out[c] = id;
    }
  }
  return out;
}

function languageColor(langId: string, extinct: boolean, tier: number): string {
  // Golden-angle hue spread so adjacent leaves visibly differ.
  const hue = (fnv1a(langId) % 360);
  const sat = extinct ? 6 : 30 + tier * 10;
  const light = extinct ? 30 : 50 - tier * 4;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function biomeColor(biome: MapCell["biome"]): string {
  switch (biome) {
    case "lowland":  return "#3d4a2e";
    case "highland": return "#4a4536";
    case "mountain": return "#5a5550";
    case "ocean":    return "#1d3a55";
  }
}

function labelsForAliveLeaves(
  tree: LanguageTree,
  worldMap: WorldMap,
): Array<{ langId: string; lang: Language; point: { x: number; y: number } }> {
  const out: Array<{ langId: string; lang: Language; point: { x: number; y: number } }> = [];
  for (const id of Object.keys(tree)) {
    const node: LanguageNode = tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const lang = node.language;
    const cells = lang.territory?.cells;
    if (!cells || cells.length === 0) continue;
    // Use the centroid of the territory for label placement.
    let cx = 0, cy = 0, n = 0;
    for (const cellId of cells) {
      const cell = worldMap.cells[cellId];
      if (!cell) continue;
      cx += cell.centroid.x;
      cy += cell.centroid.y;
      n++;
    }
    if (n === 0) continue;
    out.push({ langId: id, lang, point: { x: cx / n, y: cy / n } });
  }
  return out;
}

function renderCellTooltip(
  cellId: number,
  worldMap: WorldMap,
  ownership: Record<number, string>,
  tree: LanguageTree,
  selectedMeaning: string | null,
  script: import("../engine/phonology/display").DisplayScript,
): JSX.Element {
  const cell = worldMap.cells[cellId];
  if (!cell) return <div>—</div>;
  const ownerId = ownership[cell.id];
  if (!ownerId || !tree[ownerId]) {
    return (
      <div>
        <div style={{ color: "var(--muted)" }}>{cell.biome} · cell {cell.id}</div>
      </div>
    );
  }
  const lang = tree[ownerId]!.language;
  const tier = lang.culturalTier ?? 0;
  const samples: string[] = [];
  if (selectedMeaning && lang.lexicon[selectedMeaning]) {
    samples.push(`${selectedMeaning}: ${formatForm(lang.lexicon[selectedMeaning]!, lang, script)}`);
  }
  for (const m of ["water", "fire", "mother"]) {
    if (samples.length >= 3) break;
    if (m === selectedMeaning) continue;
    if (lang.lexicon[m]) samples.push(`${m}: ${formatForm(lang.lexicon[m]!, lang, script)}`);
  }
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        {lang.name}
        {lang.extinct && <span style={{ color: "var(--danger)" }}> †</span>}
      </div>
      <div style={{ color: "var(--muted)" }}>
        {(lang.speakers ?? 0).toLocaleString()} speakers · tier {tier} ({TIER_LABELS[tier as 0 | 1 | 2 | 3]})
      </div>
      <div style={{ color: "var(--muted)" }}>
        {(lang.territory?.cells.length ?? 0)} cells · {Object.keys(lang.lexicon).length} words
      </div>
      {samples.length > 0 && (
        <div style={{ marginTop: 4, fontFamily: "var(--font-mono)", fontSize: 10 }}>
          {samples.map((s) => <div key={s}>{s}</div>)}
        </div>
      )}
    </div>
  );
}
