import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { getWorldMap, type MapCell, type WorldMap } from "../engine/geo/map";
import { fnv1a } from "../engine/rng";
import { formatForm } from "../engine/phonology/display";
import { TIER_LABELS } from "../engine/lexicon/concepts";
import type { Language, LanguageNode, LanguageTree } from "../engine/types";

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
  const smoothedLabelRef = useRef<Record<string, { x: number; y: number }>>({});

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

  const worldMap = useMemo(
    () => getWorldMap(config.mapMode ?? "random", config.seed),
    [config.mapMode, config.seed],
  );

  const ownership = useMemo(() => buildOwnership(state.tree), [state.tree]);

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

  const drag = useRef<{ startX: number; startY: number; vx: number; vy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, vx: view.x, vy: view.y };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const baseVx = d.vx;
    const baseVy = d.vy;
    setView((v) => ({ ...v, x: baseVx + dx, y: baseVy + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = null;
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
    }
  };
  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setView((v) => ({ ...v, zoom: Math.max(0.4, Math.min(8, v.zoom * factor)) }));
  };

  const cellFills = useMemo(() => {
    const out: string[] = new Array(worldMap.cells.length);
    for (let i = 0; i < worldMap.cells.length; i++) {
      const cell = worldMap.cells[i]!;
      if (cell.biome === "ocean") {
        out[i] = cell.elevation > 0.05 ? "#2c5275" : "#15293c";
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
      out[i] = biomeColor(cell.biome);
    }
    return out;
  }, [worldMap, ownership, state.tree]);

  const [hoverCell, setHoverCell] = useState<number | null>(null);
  const [showBilingual, setShowBilingual] = useState(true);
  const [showLoans, setShowLoans] = useState(true);
  const [showAreal, setShowAreal] = useState(true);

  const leafCentroids = useMemo(() => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of Object.keys(state.tree)) {
      const node = state.tree[id]!;
      if (node.childrenIds.length > 0) continue;
      if (node.language.extinct) continue;
      const c = node.language.coords;
      if (c) out[id] = { x: c.x, y: c.y };
    }
    return out;
  }, [state.tree]);

  const bilingualEdges = useMemo(() => {
    if (!showBilingual) return [] as Array<{ aId: string; bId: string; w: number }>;
    const seen = new Set<string>();
    const out: Array<{ aId: string; bId: string; w: number }> = [];
    for (const id of Object.keys(state.tree)) {
      const lang = state.tree[id]!.language;
      const links = lang.bilingualLinks;
      if (!links) continue;
      for (const otherId of Object.keys(links)) {
        const k = id < otherId ? `${id}|${otherId}` : `${otherId}|${id}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const w = links[otherId]!;
        if (w > 0.05 && leafCentroids[id] && leafCentroids[otherId]) {
          out.push({ aId: id, bId: otherId, w });
        }
      }
    }
    return out;
  }, [state.tree, showBilingual, leafCentroids]);

  const recentLoans = useMemo(() => {
    if (!showLoans) return [] as Array<{ donorId: string; recipientId: string; age: number }>;
    const out: Array<{ donorId: string; recipientId: string; age: number }> = [];
    const cap = state.generation;
    for (const id of Object.keys(state.tree)) {
      const lang = state.tree[id]!.language;
      for (const e of lang.events) {
        if (e.kind !== "borrow") continue;
        const age = cap - e.generation;
        if (age > 5) continue;
        const donorId = e.meta?.donorId;
        const recipientId = e.meta?.recipientId;
        if (!donorId || !recipientId) continue;
        if (!leafCentroids[donorId] || !leafCentroids[recipientId]) continue;
        out.push({ donorId, recipientId, age });
      }
    }
    return out;
  }, [state.tree, state.generation, showLoans, leafCentroids]);

  const arealWaves = useMemo(() => {
    if (!showAreal) return [] as Array<{ x: number; y: number; age: number; donorId: string }>;
    const pending = state.pendingArealRules ?? [];
    return pending.slice(-12).map((w) => ({
      x: w.donorCoords.x,
      y: w.donorCoords.y,
      age: state.generation - w.birthGeneration,
      donorId: w.donorId,
    }));
  }, [state.pendingArealRules, state.generation, showAreal]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 320, position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 5,
          display: "flex",
          gap: 6,
          padding: 6,
          background: "rgba(15,31,46,0.85)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        <label title="Show bilingual contact links">
          <input type="checkbox" checked={showBilingual} onChange={(e) => setShowBilingual(e.target.checked)} /> bilingual
        </label>
        <label title="Show borrow events from the last 5 generations">
          <input type="checkbox" checked={showLoans} onChange={(e) => setShowLoans(e.target.checked)} /> loans
        </label>
        <label title="Show pending areal sound-rule waves expanding from their donor">
          <input type="checkbox" checked={showAreal} onChange={(e) => setShowAreal(e.target.checked)} /> areal
        </label>
      </div>
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
        {}
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
        {bilingualEdges.length > 0 && (
          <g pointerEvents="none">
            {bilingualEdges.map((e, i) => {
              const a = project(leafCentroids[e.aId]!.x, leafCentroids[e.aId]!.y);
              const b = project(leafCentroids[e.bId]!.x, leafCentroids[e.bId]!.y);
              return (
                <line
                  key={`bi-${i}`}
                  x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                  stroke="rgba(124,196,255,0.55)"
                  strokeWidth={Math.max(1, e.w * 4)}
                  strokeDasharray="2 4"
                />
              );
            })}
          </g>
        )}
        {recentLoans.length > 0 && (
          <g pointerEvents="none">
            {recentLoans.map((l, i) => {
              const a = project(leafCentroids[l.donorId]!.x, leafCentroids[l.donorId]!.y);
              const b = project(leafCentroids[l.recipientId]!.x, leafCentroids[l.recipientId]!.y);
              const fade = Math.max(0.15, 1 - l.age / 6);
              return (
                <g key={`loan-${i}`}>
                  <line
                    x1={a.px} y1={a.py} x2={b.px} y2={b.py}
                    stroke={`rgba(255,204,102,${fade})`}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                  <circle cx={b.px} cy={b.py} r={3} fill={`rgba(255,204,102,${fade})`} />
                </g>
              );
            })}
          </g>
        )}
        {arealWaves.length > 0 && (
          <g pointerEvents="none">
            {arealWaves.map((w, i) => {
              const c = project(w.x, w.y);
              const radius = Math.max(8, 12 + w.age * 6);
              const opacity = Math.max(0.05, 0.5 - w.age * 0.04);
              return (
                <circle
                  key={`wave-${i}`}
                  cx={c.px} cy={c.py} r={radius}
                  fill="none"
                  stroke={`rgba(167,139,255,${opacity})`}
                  strokeWidth={1.4}
                />
              );
            })}
          </g>
        )}
        {}
        {labelsForAliveLeavesSmoothed(state.tree, worldMap, smoothedLabelRef.current).map(({ langId, lang, point }) => {
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

      {}
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
  let isoglossEdges = 0;
  for (const n of cell.neighbours) {
    if (ownership[n] !== ownerId) isoglossEdges++;
  }
  const isCoast = !!cell.isCoast;
  const stroke = isOwnerSelected
    ? "var(--accent-2)"
    : isCoast
      ? "rgba(0,0,0,0.85)"
      : "rgba(0,0,0,0.4)";
  const strokeWidth = isOwnerSelected
    ? 2.5
    : isCoast
      ? 1.4
      : isoglossEdges > 0
        ? 0.6
        : 0.2;
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

function labelsForAliveLeavesSmoothed(
  tree: LanguageTree,
  worldMap: WorldMap,
  cache: Record<string, { x: number; y: number }>,
): Array<{ langId: string; lang: Language; point: { x: number; y: number } }> {
  const out: Array<{ langId: string; lang: Language; point: { x: number; y: number } }> = [];
  const ALPHA = 0.18;
  const seen = new Set<string>();
  for (const id of Object.keys(tree)) {
    const node: LanguageNode = tree[id]!;
    if (node.childrenIds.length > 0) continue;
    const lang = node.language;
    const cells = lang.territory?.cells;
    if (!cells || cells.length === 0) continue;
    let cx = 0, cy = 0, n = 0;
    for (const cellId of cells) {
      const cell = worldMap.cells[cellId];
      if (!cell) continue;
      cx += cell.centroid.x;
      cy += cell.centroid.y;
      n++;
    }
    if (n === 0) continue;
    const target = { x: cx / n, y: cy / n };
    const prev = cache[id];
    const smoothed = prev
      ? { x: prev.x + (target.x - prev.x) * ALPHA, y: prev.y + (target.y - prev.y) * ALPHA }
      : target;
    cache[id] = smoothed;
    seen.add(id);
    out.push({ langId: id, lang, point: smoothed });
  }
  for (const id of Object.keys(cache)) {
    if (!seen.has(id)) delete cache[id];
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
        <div className="t-muted">{cell.biome} · cell {cell.id}</div>
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
        {lang.extinct && <span className="t-danger"> †</span>}
      </div>
      <div className="t-muted">
        {(lang.speakers ?? 0).toLocaleString()} speakers · tier {tier} ({TIER_LABELS[tier as 0 | 1 | 2 | 3]})
      </div>
      <div className="t-muted">
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
