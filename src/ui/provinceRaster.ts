import {
  RASTER_B64,
  RASTER_W,
  RASTER_H,
  PROVINCE_COUNT,
} from "../engine/geo/provincesData";

/**
 * provinceRaster.ts
 *
 * Renderer-side helper for the Provinces.png world map. The engine map (geo/map.ts)
 * uses only province centroids + adjacency; the actual pixels live here as a baked,
 * downsampled province-id raster (one Uint16 id per display cell). We decode it once,
 * then paint provinces to an offscreen canvas by mapping each province id → an RGBA
 * colour. Callers (MapView, WorldMapPicker) get a data URL they can drop into an SVG
 * <image>, and an inverse hit-test (pixel → province id) for hover/click.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export const PROVINCE_RASTER_W = RASTER_W;
export const PROVINCE_RASTER_H = RASTER_H;

let IDS: Uint16Array | null = null;

/** Decode the base64 raster to a Uint16Array (province id per cell), cached. */
export function provinceIds(): Uint16Array {
  if (IDS) return IDS;
  const bin = atob(RASTER_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  IDS = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  return IDS;
}

/** Province id at a display-raster coordinate, or -1 if out of bounds. */
export function provinceAtRaster(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= RASTER_W || y >= RASTER_H) return -1;
  return provinceIds()[(y | 0) * RASTER_W + (x | 0)]!;
}

/**
 * Paint provinces to an offscreen canvas using a per-province RGBA table
 * (`prov2rgba[id]` packed as 0xAABBGGRR — the byte order of ImageData). Returns a
 * data URL suitable for an SVG <image href>. Cheap enough to call on ownership change.
 */
export function paintProvinces(prov2rgba: Uint32Array): string {
  const ids = provinceIds();
  const canvas = document.createElement("canvas");
  canvas.width = RASTER_W;
  canvas.height = RASTER_H;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(RASTER_W, RASTER_H);
  const px = new Uint32Array(img.data.buffer);
  for (let i = 0; i < px.length; i++) {
    const id = ids[i]!;
    px[i] = id < PROVINCE_COUNT ? prov2rgba[id]! : 0xff000000;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

/** Pack r,g,b (0-255) into 0xFFBBGGRR (opaque) for the ImageData byte order. */
export function rgba(r: number, g: number, b: number): number {
  return (0xff << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

/** HSL (h 0-360, s/l 0-100) → packed RGBA, matching the SVG hsl() language colours. */
export function hslRgba(h: number, s: number, l: number): number {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const m = l - c / 2;
  return rgba(Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255));
}
