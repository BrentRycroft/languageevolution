import { useMemo, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import {
  getWorldMap,
  randomLandCell,
  type MapCell,
  type WorldMap,
} from "../engine/geo/map";
import { makeRng } from "../engine/rng";
import { paintProvinces, provinceAtRaster, rgba } from "./provinceRaster";
import { IS_SEA, PROVINCE_COUNT } from "../engine/geo/provincesData";

/**
 * WorldMapPicker.tsx
 *
 * React app: tabs, controls, lexicon table, narrative panes, grammar view, etc. Key exports: WorldMapPicker.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function WorldMapPicker() {
  const config = useSimStore((s) => s.config);
  const updateConfig = useSimStore((s) => s.updateConfig);
  const generation = useSimStore((s) => s.state.generation);

  const mode = config.mapMode ?? "random";
  const worldMap = useMemo(
    () => getWorldMap(mode, config.seed),
    [mode, config.seed],
  );

  const [originId, setOriginId] = useState<number | null>(
    config.originCellId ?? null,
  );

  const setMode = (next: "random" | "earth" | "province") => {
    updateConfig({ mapMode: next, originCellId: undefined });
    setOriginId(null);
  };

  const apply = () => {
    updateConfig({ originCellId: originId ?? undefined });
  };

  const useSuggested = () => {
    // Phase 58.8: removed preset-specific Earth origins. Suggest
    // a random land cell for any mode/preset.
    const id = randomLandCell(worldMap, makeRng(config.seed + ":origin"));
    setOriginId(id);
  };

  return (
    <div className="col-8">
      <div role="tablist" className="row-4">
        <button
          role="tab"
          aria-selected={mode === "random"}
          className={mode === "random" ? "active" : ""}
          onClick={() => setMode("random")}
          title="Procedural continent generated from the sim seed"
        >
          Random continent
        </button>
        <button
          role="tab"
          aria-selected={mode === "earth"}
          className={mode === "earth" ? "active" : ""}
          onClick={() => setMode("earth")}
          title="Low-poly approximation of Earth's inhabited continents"
        >
          Earth-shape
        </button>
        <button
          role="tab"
          aria-selected={mode === "province"}
          className={mode === "province" ? "active" : ""}
          onClick={() => setMode("province")}
          title="Detailed province map (≈3,900 provinces) — geography drives spread & splits"
        >
          Provinces
        </button>
      </div>
      <div className="label-line">
        {mode === "random"
          ? "A unique continent generated from your seed. Same seed → same continent."
          : mode === "earth"
            ? "Stylised Earth outline. Each preset has a suggested starting region."
            : "Detailed province map: ~3,900 provinces. Pick a starting province to seed the first language."}
      </div>

      <MapPreview
        worldMap={worldMap}
        originId={originId}
        onClick={(id) => setOriginId(id)}
      />

      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={useSuggested} title="Pick the preset's suggested origin (Earth) or a random land cell (Random)">
          🎯 Use suggested
        </button>
        <button
          className="primary"
          onClick={apply}
          disabled={originId === null}
          title="Apply the chosen origin and reset the simulation"
        >
          {generation > 0 ? "Apply (resets sim)" : "Apply"}
        </button>
        {originId !== null && (
          <span className="label-line">
            cell {originId}
          </span>
        )}
      </div>
    </div>
  );
}

interface MapPreviewProps {
  worldMap: WorldMap;
  originId: number | null;
  onClick: (cellId: number) => void;
}

function MapPreview({ worldMap, originId, onClick }: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = 200;
  const scaleX = W / (worldMap.bounds.maxX - worldMap.bounds.minX);
  const scaleY = H / (worldMap.bounds.maxY - worldMap.bounds.minY);
  const project = (x: number, y: number) => ({
    px: (x - worldMap.bounds.minX) * scaleX,
    py: (y - worldMap.bounds.minY) * scaleY,
  });

  // Province mode: render the baked raster as one <image> (3,900 polygons would be
  // a mess of overlapping bbox rects), and hit-test clicks back to a province id.
  const provinceImg = useMemo(() => {
    if (worldMap.kind !== "province") return null;
    const table = new Uint32Array(PROVINCE_COUNT);
    for (let i = 0; i < PROVINCE_COUNT; i++) {
      table[i] = IS_SEA[i] === 1 ? rgba(29, 58, 85) : rgba(61, 74, 46);
    }
    return paintProvinces(table);
  }, [worldMap.kind]);

  if (worldMap.kind === "province" && provinceImg) {
    const pickProvince = (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
      const rx = (e.clientX - rect.left) / scaleX;
      const ry = (e.clientY - rect.top) / scaleY;
      const id = provinceAtRaster(rx, ry);
      if (id >= 0 && IS_SEA[id] !== 1) onClick(id);
    };
    return (
      <div
        ref={containerRef}
        style={{
          width: W, height: H, border: "1px solid var(--border)",
          borderRadius: "var(--r-2)", background: "#0f1f2e", overflow: "hidden", userSelect: "none",
        }}
      >
        <svg width={W} height={H} style={{ display: "block", cursor: "pointer" }} onClick={pickProvince}>
          <image href={provinceImg} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          {originId !== null && worldMap.cells[originId] && (
            <CrosshairAt point={project(worldMap.cells[originId]!.centroid.x, worldMap.cells[originId]!.centroid.y)} />
          )}
        </svg>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: W,
        height: H,
        border: "1px solid var(--border)",
        borderRadius: "var(--r-2)",
        background: "#0f1f2e",
        overflow: "hidden",
        userSelect: "none",
      }}
    >
      <svg width={W} height={H} style={{ display: "block" }}>
        {worldMap.cells.map((cell) => {
          if (cell.vertices.length < 3) return null;
          const points = cell.vertices
            .map((v) => {
              const p = project(v.x, v.y);
              return `${p.px},${p.py}`;
            })
            .join(" ");
          const isOcean = cell.biome === "ocean";
          const isHover = hover === cell.id;
          const isOrigin = originId === cell.id;
          let fill: string;
          if (isOrigin) fill = "var(--accent)";
          else if (isHover && !isOcean) fill = "rgba(255,255,255,0.25)";
          else fill = previewFill(cell);
          return (
            <polygon
              key={cell.id}
              points={points}
              fill={fill}
              stroke="rgba(0,0,0,0.4)"
              strokeWidth={0.3}
              onPointerEnter={() => setHover(cell.id)}
              onPointerLeave={() => setHover(null)}
              onClick={() => {
                if (!isOcean) onClick(cell.id);
              }}
              style={{ cursor: isOcean ? "default" : "pointer" }}
            />
          );
        })}
        {originId !== null && worldMap.cells[originId] && (
          <CrosshairAt
            point={project(
              worldMap.cells[originId]!.centroid.x,
              worldMap.cells[originId]!.centroid.y,
            )}
          />
        )}
      </svg>
    </div>
  );
}

function CrosshairAt({ point }: { point: { px: number; py: number } }) {
  return (
    <g transform={`translate(${point.px},${point.py})`} pointerEvents="none">
      <circle r={5} fill="none" stroke="white" strokeWidth={1.5} />
      <line x1={-8} y1={0} x2={8} y2={0} stroke="white" strokeWidth={1.2} />
      <line x1={0} y1={-8} x2={0} y2={8} stroke="white" strokeWidth={1.2} />
    </g>
  );
}

function previewFill(cell: MapCell): string {
  switch (cell.biome) {
    case "ocean":    return "#1d3a55";
    case "lowland":  return "#3d4a2e";
    case "highland": return "#4a4536";
    case "mountain": return "#5a5550";
  }
}
