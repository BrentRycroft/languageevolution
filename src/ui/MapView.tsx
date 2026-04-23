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

  // Prefer per-language persistent coords (seeded at split time), falling
  // back to the deterministic id-hash layout for older saves where the
  // `language.coords` field is missing.
  const layout = useMemo(() => {
    const ids = Object.keys(state.tree);
    const missing = ids.some((id) => !state.tree[id]!.language.coords);
    const fallback = missing ? computeGeoLayout(state) : null;
    const out: Record<string, { x: number; y: number }> = {};
    for (const id of ids) {
      out[id] = state.tree[id]!.language.coords ?? fallback![id]!;
    }
    return out;
  }, [state]);
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

  // When selection changes from elsewhere (Tree / Lexicon / Timeline), pan
  // the map so the selected node is centered. Only do this if we've laid
  // out the selected node and the user hasn't actively been dragging.
  const lastFocusedId = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedLangId || selectedLangId === lastFocusedId.current) return;
    const pos = layout[selectedLangId];
    if (!pos) return;
    lastFocusedId.current = selectedLangId;
    // Convert the node's data-space position into the pan offset that would
    // place it at the svg center at the current zoom.
    const targetX = -((pos.x - cx) * scale);
    const targetY = -((pos.y - cy) * scale);
    setView((v) => ({ ...v, x: targetX, y: targetY }));
    // We intentionally don't depend on `cx`, `cy`, `scale` — pan only when
    // the selection changes, not on every layout tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLangId]);

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

  // Walk up the tree to produce a "ProtoX > Y > Z" family path for the
  // tooltip. Caps at 4 ancestors so the text doesn't overflow.
  const familyPath = (id: string): string => {
    const chain: string[] = [];
    let cur: string | null = id;
    while (cur !== null) {
      const ancestor: import("../engine/types").LanguageNode | undefined =
        state.tree[cur];
      if (!ancestor) break;
      chain.unshift(ancestor.language.name);
      cur = ancestor.parentId;
    }
    if (chain.length > 5) {
      return [chain[0], "…", ...chain.slice(-3)].join(" › ");
    }
    return chain.join(" › ");
  };

  // Three sample words for a language's tooltip — prefer the selected
  // meaning first, then fall back to a short, stable slice.
  const tooltipSamples = (id: string): string => {
    const lang = state.tree[id]!.language;
    const out: string[] = [];
    const seen = new Set<string>();
    if (selectedMeaning && lang.lexicon[selectedMeaning]) {
      out.push(
        `${selectedMeaning}: ${formatForm(lang.lexicon[selectedMeaning]!, lang, script)}`,
      );
      seen.add(selectedMeaning);
    }
    for (const m of Object.keys(lang.lexicon).sort()) {
      if (out.length >= 3) break;
      if (seen.has(m)) continue;
      out.push(`${m}: ${formatForm(lang.lexicon[m]!, lang, script)}`);
    }
    return out.join("\n");
  };

  const extinctLeaves = useMemo(() => {
    return Object.keys(state.tree)
      .filter((id) => {
        const n = state.tree[id]!;
        return n.language.extinct && n.childrenIds.length === 0;
      })
      .map((id) => state.tree[id]!.language)
      .sort(
        (a, b) => (b.deathGeneration ?? 0) - (a.deathGeneration ?? 0),
      );
  }, [state]);

  /**
   * Recent borrow arrows: scan every language's events ring-buffer for
   * "borrow" events in the last RECENT_BORROW_WINDOW generations, so we
   * can draw a fading donor→recipient arrow. Opacity is proportional to
   * recency (a fresh borrow is bright; a ~10-gen-old one is dim).
   */
  const RECENT_BORROW_WINDOW = 12;
  const recentBorrows = useMemo(() => {
    const out: Array<{
      donorId: string;
      recipientId: string;
      meaning: string;
      age: number;
    }> = [];
    const now = state.generation;
    for (const id of Object.keys(state.tree)) {
      const lang = state.tree[id]!.language;
      for (const e of lang.events) {
        if (e.kind !== "borrow") continue;
        const age = now - e.generation;
        if (age < 0 || age > RECENT_BORROW_WINDOW) continue;
        const donorId = e.meta?.donorId;
        const recipientId = e.meta?.recipientId ?? id;
        if (!donorId) continue;
        out.push({
          donorId,
          recipientId,
          meaning: e.meta?.meaning ?? "",
          age,
        });
      }
    }
    return out;
  }, [state]);
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

        {/* Recent borrow arrows: donor → recipient, fading with age. */}
        <defs>
          <marker
            id="borrow-arrowhead"
            viewBox="0 0 6 6"
            refX="5"
            refY="3"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 6 3 L 0 6 Z" fill="#ffb473" />
          </marker>
        </defs>
        {recentBorrows.map((b, i) => {
          const donorPos = layout[b.donorId];
          const recipPos = layout[b.recipientId];
          if (!donorPos || !recipPos) return null;
          const a = project(donorPos.x, donorPos.y);
          const q = project(recipPos.x, recipPos.y);
          const fade = 1 - b.age / RECENT_BORROW_WINDOW;
          return (
            <line
              key={`b${i}`}
              x1={a.px}
              y1={a.py}
              x2={q.px}
              y2={q.py}
              stroke="#ffb473"
              strokeWidth={1.2}
              opacity={Math.max(0.1, fade * 0.8)}
              markerEnd="url(#borrow-arrowhead)"
            >
              <title>
                borrow: "{b.meaning}" ({b.age} gens ago)
              </title>
            </line>
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
                {familyPath(id)}
                {"\n"}
                {isExtinct
                  ? `extinct (gen ${lang.deathGeneration ?? "?"})`
                  : `alive — born gen ${lang.birthGeneration}`}
                {"\n"}
                {Object.keys(lang.lexicon).length} words · pace {lang.conservatism < 0.75 ? "🐇" : lang.conservatism > 1.25 ? "🐢" : "—"} {lang.conservatism.toFixed(2)}
                {"\n"}
                {tooltipSamples(id)}
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
      {extinctLeaves.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            maxHeight: "60%",
            width: 180,
            overflow: "auto",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
            padding: 8,
            fontSize: "var(--fs-1)",
          }}
        >
          <div style={{ color: "var(--muted)", marginBottom: 4 }}>
            extinct ({extinctLeaves.length})
          </div>
          {extinctLeaves.slice(0, 12).map((l) => (
            <button
              key={l.id}
              onClick={() => selectLanguage(l.id)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "2px 4px",
                marginBottom: 1,
                background:
                  selectedLangId === l.id ? "var(--panel-2)" : "transparent",
                color: "var(--text)",
                border: "none",
                borderRadius: "var(--r-1)",
                fontFamily: "var(--font-mono)",
                cursor: "pointer",
                fontSize: "var(--fs-1)",
              }}
              title={`died gen ${l.deathGeneration ?? "?"}, born gen ${l.birthGeneration}`}
            >
              {l.name}{" "}
              <span style={{ color: "var(--muted)" }}>
                †{l.deathGeneration ?? "?"}
              </span>
            </button>
          ))}
          {extinctLeaves.length > 12 && (
            <div style={{ color: "var(--muted)", marginTop: 4 }}>
              +{extinctLeaves.length - 12} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
