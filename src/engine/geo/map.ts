import { Delaunay, Voronoi } from "d3-delaunay";
import { fnv1a, makeRng, type Rng } from "../rng";

/**
 * A single Voronoi cell on the world map. Cells tile the map area
 * exhaustively and have explicit neighbour lists so areal mechanics
 * can ask "do these two cells share an edge?".
 *
 * Cells are immutable after generation — they belong to the map, not
 * to any language. Languages claim cells via their `territory.cells`
 * list.
 */
export interface MapCell {
  id: number;
  centroid: { x: number; y: number };
  /** Polygon vertices (clockwise) for SVG rendering. */
  vertices: Array<{ x: number; y: number }>;
  /** Cell ids that share an edge with this cell. */
  neighbours: number[];
  /** 0–1, used to derive biome. */
  elevation: number;
  biome: "ocean" | "lowland" | "highland" | "mountain";
  /** True for land cells with at least one ocean neighbour — used by
   *  the renderer to draw a coastline stroke. Optional for back-compat
   *  with pre-PR-D saves. */
  isCoast?: boolean;
}

export interface WorldMap {
  cells: MapCell[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Whether this map is the procedural random-continent or the Earth shape. */
  kind: "random" | "earth";
}

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 600;

/**
 * Cheap 2D Perlin-ish noise via four sine waves of different
 * frequencies. Deterministic given (x, y, seed). Returns a value in
 * roughly [-1, 1]; callers normalise to [0, 1] for elevation.
 */
function noise2D(x: number, y: number, seed: number): number {
  const s1 = (seed >>> 0) & 0xff;
  const s2 = (seed >>> 8) & 0xff;
  const s3 = (seed >>> 16) & 0xff;
  const s4 = (seed >>> 24) & 0xff;
  // Frequencies + phases blended via different seed bytes.
  const v =
    Math.sin(x * 0.005 + s1 * 0.1) *
      Math.cos(y * 0.005 + s2 * 0.1) +
    0.5 *
      Math.sin(x * 0.013 + s3 * 0.1) *
      Math.cos(y * 0.013 + s4 * 0.1) +
    0.25 *
      Math.sin(x * 0.027 + s1 * 0.1 + 0.3) *
      Math.cos(y * 0.027 + s3 * 0.1 + 0.7);
  return v / 1.75; // approximately in [-1, 1]
}

function classifyBiome(elevation: number): MapCell["biome"] {
  if (elevation < 0.3) return "ocean";
  if (elevation < 0.55) return "lowland";
  if (elevation < 0.78) return "highland";
  return "mountain";
}

/**
 * Build the connectivity graph from a d3-delaunay Voronoi diagram.
 * Two cells are neighbours iff they share at least one polygon edge.
 */
function deriveNeighbours(voronoi: Voronoi<Delaunay.Point>, count: number): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < count; i++) {
    const ns = Array.from(voronoi.neighbors(i));
    out.push(ns);
  }
  return out;
}

/**
 * Convert the d3-delaunay polygon for cell `i` into our vertex list.
 * The polygon comes back as a flat-ish array of [x, y] pairs forming
 * a closed loop (last point repeats the first); we drop the closing
 * duplicate.
 */
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

/**
 * Lloyd-relax the seed points one iteration to even out cell sizes.
 * Without this the Voronoi cells from a uniform-random sample have
 * widely varying areas, which makes territory growth feel chaotic.
 */
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

/**
 * Generate a random-continent world map deterministically from `seed`.
 *
 * Pipeline:
 *  1. Sample 180 jittered grid points across the map area.
 *  2. Voronoi-tessellate them; one Lloyd relaxation pass for evenness.
 *  3. Derive neighbour lists from the Delaunay graph.
 *  4. Sample Perlin-ish noise at each centroid → elevation.
 *  5. Classify into ocean / lowland / highland / mountain by elevation.
 */
export function generateRandomContinent(seed: string): WorldMap {
  const rng: Rng = makeRng(seed);
  // Jittered-grid sampling for a more even point distribution than
  // pure random would give. 15×12 grid + jitter ≈ 180 points.
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
  // One Lloyd-relaxation pass.
  const relaxed = lloydRelax(points, voronoi);
  delaunay = Delaunay.from(relaxed);
  voronoi = delaunay.voronoi([0, 0, MAP_WIDTH, MAP_HEIGHT]);

  const noiseSeed = fnv1a(seed + ":noise");
  const cells: MapCell[] = [];
  const neighbours = deriveNeighbours(voronoi, relaxed.length);
  for (let i = 0; i < relaxed.length; i++) {
    const verts = cellVertices(voronoi, i);
    if (verts.length === 0) continue;
    const centroid = centroidOf(verts);
    // Elevation: noise + radial fall-off. Map edges get pushed under
    // sea level so the continent doesn't wrap to the border.
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
  // Coastline pass — same as the Earth map's: flag every land cell
  // with an ocean neighbour for the renderer's coast stroke.
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

/**
 * Earth-shape map. Hand-tuned blob centres approximate the major
 * inhabited continents (Eurasia, Africa, Americas, Oceania,
 * Australia). Each "blob" pulls nearby cells above sea level. The
 * exact shapes are stylised — the simulator is language-agnostic
 * and we want a recognisably-Earth silhouette without obliging the
 * user to think this is real geography.
 *
 * Coordinates are in the same MAP_WIDTH × MAP_HEIGHT space as
 * `generateRandomContinent`, so the SVG renderer is reused directly.
 */
/**
 * Hand-crafted 60×30 land/sea bitmap. Each `#` is land, each `.` is
 * ocean. Sampled per Voronoi cell to derive elevation. Replaces the
 * five-ellipse blob model — produces a recognisably-Earth silhouette
 * with separate continents (Africa visibly distinct from Eurasia,
 * pointed South-American tip, Australia as its own island, etc.).
 *
 * Coordinate mapping:
 *   col 0  ≈ longitude -180   (Pacific west of Americas)
 *   col 30 ≈ longitude    0   (prime meridian / Greenwich)
 *   col 59 ≈ longitude +180   (Pacific east of New Zealand)
 *   row 0  ≈ latitude  +85    (Arctic)
 *   row 29 ≈ latitude  -85    (Antarctic)
 *
 * The bitmap is intentionally coarse — a higher-resolution embedded
 * world map would balloon the bundle and overshoot the simulator's
 * scope (the map is for *language territories*, not geography).
 */
const EARTH_BITMAP: readonly string[] = [
  "....................########.....................##........",  //  0
  "...................##############...........###########....",  //  1
  "..............################################################",  //  2
  ".............################...............#################",  //  3
  ".............##############.................#################",  //  4
  "...........###############..................#################",  //  5
  "..........###############......##............################",  //  6
  ".........###############.......######........###############.",  //  7
  ".........##############........#######........##############.",  //  8
  "..........############.........########........#############.",  //  9
  "..........###########..........########........############..",  // 10
  "...........#########..........#########........############..",  // 11
  "............########.........###########.......##########....",  // 12
  ".............######.........############........########.....",  // 13
  "..............####.........#############.........########....",  // 14
  "...............###........##############..........########...",  // 15
  "...............####.......##############..........#########..",  // 16
  "...............#####......#############...........#########..",  // 17
  "................######....############.............########.",  // 18
  ".................#####....###########..............########.",  // 19
  ".................#####....##########.................######.",  // 20
  ".................#####....##########..........############..",  // 21
  "..................####....#########..........#############..",  // 22
  "..................####....########.............########.....",  // 23
  "...................###....######...............######.......",  // 24
  "....................##....####.................####.........",  // 25
  ".....................#....##....................##..........",  // 26
  "............................................................",  // 27
  "############################################################",  // 28
  "############################################################",  // 29
];

/**
 * Sample the Earth bitmap at a real-coordinate point and return a
 * land score in [0, 1]. Bilinear-blends the 4 surrounding bitmap
 * cells so coastlines come out smooth rather than pixelated.
 */
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

/**
 * Earth-shape WorldMap. Generated once and cached — same shape every
 * boot; only the cell ids depend on the cell count constant.
 */
export function generateEarthMap(): WorldMap {
  // Use a fixed seed so the cell graph is identical across all
  // sims that pick "earth" mode. Population of cells is ALSO seeded
  // off this so the map is shareable / reproducible.
  // PR D: bitmap version uses ~30 cols × 18 rows (was 18 × 12) so the
  // bitmap detail (Mediterranean separation, Madagascar gap, Indian
  // peninsula bump, etc.) actually comes through at cell granularity.
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
    if (verts.length === 0) continue;
    const centroid = centroidOf(verts);
    // Elevation from the hand-crafted bitmap. Bilinear-blended so
    // coastlines slope rather than stair-step. The +0.15 floor keeps
    // ocean cells near coasts at "shallow shelf" rather than abyssal,
    // which the renderer can pick up later for a coastal palette.
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
  // Coastline pass: every land cell with at least one ocean neighbour
  // is flagged so the renderer can draw a thicker, darker stroke
  // there (gives continents a visible silhouette).
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

/**
 * Pick a default starting cell for a preset on the Earth map. Each
 * preset has a suggested origin region — PIE in the Pontic-Caspian,
 * Romance in Italy, Bantu in central Africa. The function returns the
 * id of the land cell closest to the suggested point.
 */
const PRESET_EARTH_ORIGINS: Record<string, { x: number; y: number }> = {
  pie: { x: 620, y: 220 },          // Pontic-Caspian
  germanic: { x: 580, y: 200 },     // Northern Europe
  romance: { x: 600, y: 250 },      // Italian peninsula
  bantu: { x: 540, y: 400 },        // Central / West Africa
  tokipona: { x: 600, y: 220 },     // Neutral
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

/** Pick a random viable land cell — used when the user skips origin click. */
export function randomLandCell(map: WorldMap, rng: Rng): number | null {
  const land = map.cells.filter((c) => c.biome !== "ocean");
  if (land.length === 0) return null;
  return land[rng.int(land.length)]!.id;
}

/**
 * Module-level memoisation. `generateRandomContinent` is pure given
 * `seed`, so we cache it. Earth map is fully fixed and cached once.
 */
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

/**
 * Count of shared edges between two cells. Used for areal-share
 * metric: two languages with cells along a long border share more
 * edges and therefore borrow / converge more readily than two
 * languages whose territories barely touch.
 */
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

/** Centroid of a set of cells, weighted equally. */
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
