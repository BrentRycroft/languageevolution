import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { computeGeoLayout, boundingBox } from "../engine/geo";
import { formatForm } from "../engine/phonology/display";

/**
 * 2-D "world map" of the language family. Each node gets a deterministic
 * position derived from its id hash and depth; splits push children apart,
 * so the final layout visually evokes migration.
 *
 * Interaction: pan and zoom via drag / scroll. Clicking a leaf selects it.
 */
export function MapView() {
  const state = useSimStore((s) => s.state);
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

  const layout = useMemo(() => computeGeoLayout(state), [state]);
  const bb = useMemo(() => boundingBox(layout), [layout]);
  const dataW = Math.max(1, bb.maxX - bb.minX);
  const dataH = Math.max(1, bb.maxY - bb.minY);

  // Fit-to-view scale (with some padding).
  const pad = 60;
  const fitScale = Math.min(
    (size.w - pad * 2) / dataW,
    (size.h - pad * 2) / dataH,
  );
  const scale = Math.max(0.05, fitScale * view.zoom);
  const cx = (bb.minX + bb.maxX) / 2;
  const cy = (bb.minY + bb.maxY) / 2;

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
    setView((v) => ({ ...v, zoom: Math.max(0.25, Math.min(6, v.zoom * factor)) }));
  };

  const ids = useMemo(() => Object.keys(layout), [layout]);
  // Project a data-space (x, y) into pixel coordinates inside the svg.
  const project = (x: number, y: number) => ({
    px: (x - cx) * scale + size.w / 2 + view.x,
    py: (y - cy) * scale + size.h / 2 + view.y,
  });

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 300, position: "relative" }}
    >
      <svg
        width={size.w}
        height={size.h}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2)",
          cursor: drag.current ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        {/* Links from parent to child. */}
        {ids.map((id) => {
          const node = state.tree[id]!;
          if (!node.parentId) return null;
          const parentPos = layout[node.parentId];
          const childPos = layout[id];
          if (!parentPos || !childPos) return null;
          const a = project(parentPos.x, parentPos.y);
          const b = project(childPos.x, childPos.y);
          const extinct = !!node.language.extinct;
          return (
            <line
              key={id}
              x1={a.px}
              y1={a.py}
              x2={b.px}
              y2={b.py}
              stroke="var(--border-strong)"
              strokeWidth={1}
              strokeDasharray={extinct ? "3 3" : undefined}
              opacity={extinct ? 0.5 : 1}
            />
          );
        })}

        {/* Nodes. */}
        {ids.map((id) => {
          const node = state.tree[id]!;
          const pos = layout[id];
          if (!pos) return null;
          const { px, py } = project(pos.x, pos.y);
          const lang = node.language;
          const isLeaf = node.childrenIds.length === 0;
          const isSelected = selectedLangId === id;
          const isExtinct = !!lang.extinct;
          const r = isLeaf ? 6 : 3;
          const sample =
            selectedMeaning && lang.lexicon[selectedMeaning]
              ? formatForm(lang.lexicon[selectedMeaning]!, lang, script)
              : "";
          return (
            <g
              key={id}
              transform={`translate(${px},${py})`}
              onClick={() => selectLanguage(id)}
              style={{ cursor: "pointer" }}
            >
              <title>
                {lang.name}
                {isExtinct ? " (extinct)" : ""} — {Object.keys(lang.lexicon).length} words
              </title>
              <circle
                r={r}
                fill={
                  isExtinct
                    ? "var(--muted-2)"
                    : isLeaf
                      ? "var(--accent)"
                      : "var(--muted)"
                }
                stroke={isSelected ? "var(--accent-2)" : "transparent"}
                strokeWidth={isSelected ? 3 : 0}
                opacity={isExtinct ? 0.5 : 1}
              />
              {isLeaf && (
                <>
                  <text
                    x={0}
                    y={r + 11}
                    textAnchor="middle"
                    fill="var(--text)"
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    opacity={isExtinct ? 0.5 : 1}
                  >
                    {lang.name}
                  </text>
                  {sample && (
                    <text
                      x={0}
                      y={r + 22}
                      textAnchor="middle"
                      fill="var(--muted)"
                      fontSize={9}
                      fontFamily="var(--font-mono)"
                      opacity={isExtinct ? 0.4 : 1}
                    >
                      {sample}
                    </text>
                  )}
                </>
              )}
            </g>
          );
        })}
      </svg>
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
        drag to pan · scroll to zoom · zoom {view.zoom.toFixed(2)}×
      </div>
    </div>
  );
}
