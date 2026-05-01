import { Delaunay, Voronoi } from "d3-delaunay";
import { fnv1a, makeRng, type Rng } from "../rng";

export interface MapCell {
  id: number;
  centroid: { x: number; y: number };
  vertices: Array<{ x: number; y: number }>;
  neighbours: number[];
  elevation: number;
  biome: "ocean" | "lowland" | "highland" | "mountain";
  isCoast?: boolean;
}

export interface WorldMap {
  cells: MapCell[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  kind: "random" | "earth";
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;

function noise2D(x: number, y: number, seed: number): number {
  const s1 = (seed >>> 0) & 0xff;
  const s2 = (seed >>> 8) & 0xff;
  const s3 = (seed >>> 16) & 0xff;
  const s4 = (seed >>> 24) & 0xff;
  const v =
    Math.sin(x * 0.005 + s1 * 0.1) *
      Math.cos(y * 0.005 + s2 * 0.1) +
    0.5 *
      Math.sin(x * 0.013 + s3 * 0.1) *
      Math.cos(y * 0.013 + s4 * 0.1) +
    0.25 *
      Math.sin(x * 0.027 + s1 * 0.1 + 0.3) *
      Math.cos(y * 0.027 + s3 * 0.1 + 0.7);
  return v / 1.75;
}

function classifyBiome(elevation: number): MapCell["biome"] {
  if (elevation < 0.3) return "ocean";
  if (elevation < 0.55) return "lowland";
  if (elevation < 0.78) return "highland";
  return "mountain";
}

function deriveNeighbours(voronoi: Voronoi<Delaunay.Point>, count: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    const ns = Array.from(voronoi.neighbors(i));
    out.push(ns);
  }
  return out;
}

function cellVertices(
  voronoi: Voronoi<Delaunay.Point>,
  i: number,
): Array<{ x: number; y: number }> {
  const poly = voronoi.cellPolygon(i);
  if (!poly) return [];
  const out: Array<{ x: number; y: number }> = [];
  for (let k = 0; k < poly.length - 1; k++) {
    const p = poly[k]!;
    out.push({ x: p[0], y: p[1] });
  }
  return out;
}

function centroidOf(vertices: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (vertices.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  for (const v of vertices) {
    cx += v.x;
    cy += v.y;
  }
  return { x: cx / vertices.length, y: cy / vertices.length };
}

function lloydRelax(
  points: Array<[number, number]>,
  voronoi: Voronoi<Delaunay.Point>,
): Array<[number, number]> {
  return points.map((p, i) => {
    const verts = cellVertices(voronoi, i);
    if (verts.length === 0) return p;
    const c = centroidOf(verts);
    return [c.x, c.y] as [number, number];
  });
}

export function generateRandomContinent(seed: string): WorldMap {
  const rng: Rng = makeRng(seed);
  const cols = 15;
  const rows = 12;
  const cellW = MAP_WIDTH / cols;
  const cellH = MAP_HEIGHT / rows;
  const points: Array<[number, number]> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jitterX = (rng.next() - 0.5) * cellW * 0.7;
      const jitterY = (rng.next() - 0.5) * cellH * 0.7;
      points.push([
        col * cellW + cellW / 2 + jitterX,
        row * cellH + cellH / 2 + jitterY,
      ]);
    }
  }
  let delaunay = Delaunay.from(points);
  let voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);
  const relaxed = lloydRelax(points, voronoi);
  delaunay = Delaunay.from(relaxed);
  voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);

  const noiseSeed = fnv1a(seed + ":noise");
  const cells: MapCell[] = [];
  const neighbours = deriveNeighbours(voronoi, relaxed.length);
  for (let i = 0; i < relaxed.length; i++) {
    const verts = cellVertices(voronoi, i);
    if (verts.length === 0) {
      const sx = relaxed[i]![0];
      const sy = relaxed[i]![1];
      cells.push({
        id: i,
        centroid: { x: sx, y: sy },
        vertices: [{ x: sx, y: sy }],
        neighbours: neighbours[i] ?? [],
        elevation: 0,
        biome: classifyBiome(0),
      });
      continue;
    }
    const centroid = centroidOf(verts);
    const dx = (centroid.x - MAP_WIDTH / 2) / (MAP_WIDTH / 2);
    const dy = (centroid.y - MAP_HEIGHT / 2) / (MAP_HEIGHT / 2);
    const radial = 1 - Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const raw = (noise2D(centroid.x, centroid.y, noiseSeed) + 1) / 2;
    const elevation = Math.max(0, Math.min(1, 0.4 * raw + 0.6 * radial - 0.05));
    cells.push({
      id: i,
      centroid,
      vertices: verts,
      neighbours: neighbours[i] ?? [],
      elevation,
      biome: classifyBiome(elevation),
    });
  }
  for (const cell of cells) {
    if (cell.biome === "ocean") continue;
    for (const n of cell.neighbours) {
      const nb = cells[n];
      if (nb && nb.biome === "ocean") {
        cell.isCoast = true;
        break;
      }
    }
  }
  return {
    cells,
    bounds: { minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT },
    kind: "random",
  };
}

const EARTH_BITMAP: readonly string[] = [
  "......................#####.........###########.............",
  "....###############...######.......#############............",
  "....###############...#####.........#####################...",
  "....#######################...#############################.",
  "....##################........#############################.",
  "....###################.......#############################.",
  "....###################.......############################..",
  "....###################............#######################..",
  "...........#########..........###########################...",
  "...........#########..........#########################.....",
  ".............##########.......#########################.....",
  "................#######.......#########################.....",
  "................#######.......###########......#######......",
  ".................######........##########......#######......",
  ".................######........##########...................",
  ".................#####..........########.........########...",
  ".................#####..........########.........########...",
  "..................####..........########.........########...",
  "..................####............####.##........########...",
  "..................####.................##.........#####.....",
  "...................###..............................###.....",
  "...................###..............................###.....",
  "...................###..............................###.....",
  "............................................................",
  "............................................................",
  "............................................................",
  "........#############################################.......",
  "############################################################",
  "############################################################",
  "############################################################",
];

function earthBitmapScore(x: number, y: number): number {
  const cols = EARTH_BITMAP[0]!.length;
  const rows = EARTH_BITMAP.length;
  const fx = (x / MAP_WIDTH) * (cols - 1);
  const fy = (y / MAP_HEIGHT) * (rows - 1);
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(cols - 1, x0 + 1), y1 = Math.min(rows - 1, y0 + 1);
  const wx = fx - x0, wy = fy - y0;
  const at = (cx: number, cy: number) =>
    EARTH_BITMAP[cy]![cx] === "#" ? 1 : 0;
  const a = at(x0, y0), b = at(x1, y0);
  const c = at(x0, y1), d = at(x1, y1);
  const top = a * (1 - wx) + b * wx;
  const bot = c * (1 - wx) + d * wx;
  return top * (1 - wy) + bot * wy;
}

export function generateEarthMap(): WorldMap {
  const baseSeed = "earth-bitmap-v2";
  const rng = makeRng(baseSeed);
  const cols = 30;
  const rows = 18;
  const cellW = MAP_WIDTH / cols;
  const cellH = MAP_HEIGHT / rows;
  const points: Array<[number, number]> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const jitterX = (rng.next() - 0.5) * cellW * 0.6;
      const jitterY = (rng.next() - 0.5) * cellH * 0.6;
      points.push([
        col * cellW + cellW / 2 + jitterX,
        row * cellH + cellH / 2 + jitterY,
      ]);
    }
  }
  let delaunay = Delaunay.from(points);
  let voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);
  const relaxed = lloydRelax(points, voronoi);
  delaunay = Delaunay.from(relaxed);
  voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);

  const cells: MapCell[] = [];
  const neighbours = deriveNeighbours(voronoi, relaxed.length);
  for (let i = 0; i < relaxed.length; i++) {
    const verts = cellVertices(voronoi, i);
    if (verts.length === 0) {
      const sx = relaxed[i]![0];
      const sy = relaxed[i]![1];
      cells.push({
        id: i,
        centroid: { x: sx, y: sy },
        vertices: [{ x: sx, y: sy }],
        neighbours: neighbours[i] ?? [],
        elevation: 0,
        biome: classifyBiome(0),
      });
      continue;
    }
    const centroid = centroidOf(verts);
    const score = earthBitmapScore(centroid.x, centroid.y);
    const elevation = Math.max(0, Math.min(1, 0.15 + score * 0.85));
    cells.push({
      id: i,
      centroid,
      vertices: verts,
      neighbours: neighbours[i] ?? [],
      elevation,
      biome: classifyBiome(elevation),
    });
  }
  for (const cell of cells) {
    if (cell.biome === "ocean") continue;
    for (const n of cell.neighbours) {
      const nb = cells[n];
      if (nb && nb.biome === "ocean") {
        cell.isCoast = true;
        break;
      }
    }
  }
  return {
    cells,
    bounds: { minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT },
    kind: "earth",
  };
}

const PRESET_EARTH_ORIGINS: Record<string, { x: number; y: number }> = {
  pie: { x: 620, y: 220 },
  germanic: { x: 580, y: 200 },
  romance: { x: 600, y: 250 },
  bantu: { x: 540, y: 400 },
  tokipona: { x: 600, y: 220 },
  default: { x: 600, y: 220 },
};

export function suggestedEarthOrigin(presetId: string | undefined, map: WorldMap): number | null {
  const target = PRESET_EARTH_ORIGINS[presetId ?? "default"] ?? PRESET_EARTH_ORIGINS.default!;
  let best: number | null = null;
  let bestDist = Infinity;
  for (const cell of map.cells) {
    if (cell.biome === "ocean") continue;
    const dx = cell.centroid.x - target.x;
    const dy = cell.centroid.y - target.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestDist) {
      bestDist = d;
      best = cell.id;
    }
  }
  return best;
}

export function randomLandCell(map: WorldMap, rng: Rng): number | null {
  const land = map.cells.filter((c) => c.biome !== "ocean");
  if (land.length === 0) return null;
  return land[rng.int(land.length)]!.id;
}

const RANDOM_CACHE = new Map<string, WorldMap>();
let EARTH_CACHE: WorldMap | null = null;

export function getWorldMap(mode: "random" | "earth", seed: string): WorldMap {
  if (mode === "earth") {
    if (!EARTH_CACHE) EARTH_CACHE = generateEarthMap();
    return EARTH_CACHE;
  }
  const cached = RANDOM_CACHE.get(seed);
  if (cached) return cached;
  const map = generateRandomContinent(seed);
  RANDOM_CACHE.set(seed, map);
  return map;
}

export function sharedEdgeCount(
  map: WorldMap,
  cellsA: readonly number[],
  cellsB: readonly number[],
): number {
  if (cellsA.length === 0 || cellsB.length === 0) return 0;
  const setB = new Set(cellsB);
  let count = 0;
  for (const a of cellsA) {
    const cell = map.cells[a];
    if (!cell) continue;
    for (const n of cell.neighbours) {
      if (setB.has(n)) count++;
    }
  }
  return count;
}

export function territoryCentroid(map: WorldMap, cells: readonly number[]): { x: number; y: number } {
  if (cells.length === 0) return { x: 0, y: 0 };
  let cx = 0;
  let cy = 0;
  let n = 0;
  for (const id of cells) {
    const cell = map.cells[id];
    if (!cell) continue;
    cx += cell.centroid.x;
    cy += cell.centroid.y;
    n++;
  }
  if (n === 0) return { x: 0, y: 0 };
  return { x: cx / n, y: cy / n };
}
