/**
 * build-provinces.mjs — generate src/engine/geo/provincesData.ts from maps/Provinces.png
 *
 * Provinces.png is a Paradox-style province map: every unique RGB colour is one
 * province (~3900 of them), with no land/sea metadata. We decode the PNG (hand-rolled,
 * Node zlib — colourType 2 / bitDepth 8 / non-interlaced), then for each province
 * compute area, centroid, bounding box, border adjacency (full resolution), and a
 * land/sea class from colour (sea provinces are conventionally cyan/blue). Finally we
 * bake a downsampled province-id raster for canvas rendering. Everything geometric is
 * computed at full resolution; only the display raster is downsampled.
 *
 *   node scripts/build-provinces.mjs            # bake (DS=6 default)
 *   SURVEY=1 node scripts/build-provinces.mjs   # just print stats, don't write
 *   DS=4 node scripts/build-provinces.mjs        # choose downsample factor
 */
import fs from "fs";
import zlib from "zlib";
import path from "path";

const DS = parseInt(process.env.DS || "6", 10);
const SURVEY = !!process.env.SURVEY;
const PNG = path.resolve("maps/Provinces.png");

function decodePng(file) {
  const buf = fs.readFileSync(file);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not a PNG");
  let pos = 8, width = 0, height = 0, colorType = 0, bitDepth = 0, interlace = 0;
  const idats = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos); pos += 4;
    const type = buf.toString("ascii", pos, pos + 4); pos += 4;
    if (type === "IHDR") {
      width = buf.readUInt32BE(pos); height = buf.readUInt32BE(pos + 4);
      bitDepth = buf[pos + 8]; colorType = buf[pos + 9]; interlace = buf[pos + 12];
    } else if (type === "IDAT") idats.push(buf.subarray(pos, pos + len));
    else if (type === "IEND") break;
    pos += len + 4;
  }
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0)
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace})`);
  const ch = colorType === 2 ? 3 : 4;
  const stride = width * ch;
  const raw = zlib.inflateSync(Buffer.concat(idats));
  const out = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[rp++], o = y * stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[rp++];
      const a = x >= ch ? out[o + x - ch] : 0;
      const b = y > 0 ? out[o - stride + x] : 0;
      const c = (x >= ch && y > 0) ? out[o - stride + x - ch] : 0;
      let r;
      switch (f) { case 0: r = v; break; case 1: r = v + a; break; case 2: r = v + b; break; case 3: r = v + ((a + b) >> 1); break; case 4: r = v + paeth(a, b, c); break; default: throw new Error("filter " + f); }
      out[o + x] = r & 0xff;
    }
  }
  return { out, width, height, ch };
}

/** sea = conventionally cyan/blue: high blue & green, blue clearly above red. */
function isSeaColor(r, g, b) {
  return b > 150 && g > 140 && b >= r + 40 && g >= r;
}

const { out, width, height, ch } = decodePng(PNG);
const colorAt = (x, y) => { const o = (y * width + x) * ch; return (out[o] << 16) | (out[o + 1] << 8) | out[o + 2]; };

// 1. Assign each unique colour a stable id (sorted by colour key for determinism).
const colorSet = new Set();
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) colorSet.add(colorAt(x, y));
const colors = [...colorSet].sort((a, b) => a - b);
const idOf = new Map();
colors.forEach((c, i) => idOf.set(c, i));
const N = colors.length;

// 2. Per-province accumulators (full resolution).
const area = new Int32Array(N), sumX = new Float64Array(N), sumY = new Float64Array(N);
const minX = new Int32Array(N).fill(width), minY = new Int32Array(N).fill(height);
const maxX = new Int32Array(N).fill(-1), maxY = new Int32Array(N).fill(-1);
const sea = new Uint8Array(N);
for (let i = 0; i < N; i++) { const c = colors[i]; sea[i] = isSeaColor((c >> 16) & 255, (c >> 8) & 255, c & 255) ? 1 : 0; }
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const id = idOf.get(colorAt(x, y));
  area[id]++; sumX[id] += x; sumY[id] += y;
  if (x < minX[id]) minX[id] = x; if (x > maxX[id]) maxX[id] = x;
  if (y < minY[id]) minY[id] = y; if (y > maxY[id]) maxY[id] = y;
}

// 3. Border adjacency (full resolution: right + down neighbours).
const adj = Array.from({ length: N }, () => new Set());
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const a = idOf.get(colorAt(x, y));
  if (x + 1 < width) { const b = idOf.get(colorAt(x + 1, y)); if (b !== a) { adj[a].add(b); adj[b].add(a); } }
  if (y + 1 < height) { const b = idOf.get(colorAt(x, y + 1)); if (b !== a) { adj[a].add(b); adj[b].add(a); } }
}

// 4. Downsampled display raster (province id per display cell; 0xFFFF = none).
const Wd = Math.floor(width / DS), Hd = Math.floor(height / DS);
const raster = new Uint16Array(Wd * Hd);
const seen = new Uint8Array(N);
let visible = 0;
for (let ry = 0; ry < Hd; ry++) for (let rx = 0; rx < Wd; rx++) {
  const px = Math.min(width - 1, Math.floor((rx + 0.5) * DS));
  const py = Math.min(height - 1, Math.floor((ry + 0.5) * DS));
  const id = idOf.get(colorAt(px, py));
  raster[ry * Wd + rx] = id;
  if (!seen[id]) { seen[id] = 1; visible++; }
}

// Stats.
let landN = 0, seaN = 0, landPx = 0, seaPx = 0;
for (let i = 0; i < N; i++) { if (sea[i]) { seaN++; seaPx += area[i]; } else { landN++; landPx += area[i]; } }
let edges = 0; for (let i = 0; i < N; i++) edges += adj[i].size; edges /= 2;
console.error(`provinces=${N} land=${landN} sea=${seaN} | land px=${(landPx / (width * height) * 100).toFixed(1)}%`);
console.error(`adjacency edges=${edges} avg degree=${(edges * 2 / N).toFixed(1)}`);
console.error(`display raster ${Wd}x${Hd} (DS=${DS}) visible provinces=${visible}/${N} (${(visible / N * 100).toFixed(1)}%)`);
if (SURVEY) {
  for (const d of [3, 4, 6, 8]) {
    const wd = Math.floor(width / d), hd = Math.floor(height / d);
    const s = new Uint8Array(N); let vis = 0;
    for (let ry = 0; ry < hd; ry++) for (let rx = 0; rx < wd; rx++) {
      const px = Math.min(width - 1, Math.floor((rx + 0.5) * d));
      const py = Math.min(height - 1, Math.floor((ry + 0.5) * d));
      const id = idOf.get(colorAt(px, py)); if (!s[id]) { s[id] = 1; vis++; }
    }
    console.error(`  DS=${d}: ${wd}x${hd} (${wd * hd} cells, raster ~${(wd * hd * 2 / 1024).toFixed(0)}KB) visible=${vis}/${N}`);
  }
  process.exit(0);
}

// 5. Bake. Centroids/bbox in DISPLAY coordinates (full / DS) so they align with raster & bounds.
const cx = [], cy = [], bx0 = [], by0 = [], bx1 = [], by1 = [], ar = [], isSeaArr = [], nb = [];
for (let i = 0; i < N; i++) {
  cx.push(+(sumX[i] / area[i] / DS).toFixed(1));
  cy.push(+(sumY[i] / area[i] / DS).toFixed(1));
  bx0.push(Math.floor(minX[i] / DS)); by0.push(Math.floor(minY[i] / DS));
  bx1.push(Math.ceil(maxX[i] / DS)); by1.push(Math.ceil(maxY[i] / DS));
  ar.push(area[i]);
  isSeaArr.push(sea[i]);
  nb.push([...adj[i]].sort((a, b) => a - b));
}
const rasterB64 = Buffer.from(raster.buffer, raster.byteOffset, raster.byteLength).toString("base64");
const banner =
  `// AUTO-GENERATED by scripts/build-provinces.mjs — DO NOT EDIT BY HAND.\n` +
  `// Source: maps/Provinces.png (${width}x${height}, ${N} provinces). Each colour = one\n` +
  `// province. Land/sea inferred from colour (sea = cyan/blue). Geometry at full res;\n` +
  `// display raster downsampled ${DS}x to ${Wd}x${Hd}. Centroids/bbox in raster coords.\n`;
const body =
  `export const PROVINCE_COUNT = ${N};\n` +
  `export const RASTER_W = ${Wd};\n` +
  `export const RASTER_H = ${Hd};\n` +
  `/** province id per display cell (Uint16, ${Wd}x${Hd}, base64 of little-endian buffer). */\n` +
  `export const RASTER_B64 = ${JSON.stringify(rasterB64)};\n` +
  `export const CX: ReadonlyArray<number> = ${JSON.stringify(cx)};\n` +
  `export const CY: ReadonlyArray<number> = ${JSON.stringify(cy)};\n` +
  `export const BBOX: ReadonlyArray<readonly [number, number, number, number]> = ${JSON.stringify(bx0.map((_, i) => [bx0[i], by0[i], bx1[i], by1[i]]))};\n` +
  `export const AREA: ReadonlyArray<number> = ${JSON.stringify(ar)};\n` +
  `export const IS_SEA: ReadonlyArray<number> = ${JSON.stringify(isSeaArr)};\n` +
  `export const NEIGHBOURS: ReadonlyArray<ReadonlyArray<number>> = ${JSON.stringify(nb)};\n`;
const target = "src/engine/geo/provincesData.ts";
fs.writeFileSync(target, banner + body);
console.error(`wrote ${target} (${(fs.statSync(target).size / 1024).toFixed(0)}KB)`);
