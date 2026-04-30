import { fnv1a } from "../rng";

const PI = Math.PI;
const TWO_PI = 2 * PI;
const PI_SQ = PI * PI;

function sinApprox(x: number): number {
  let t = x - TWO_PI * Math.floor((x + PI) / TWO_PI);
  const sign = t < 0 ? -1 : 1;
  const at = t < 0 ? -t : t;
  const k = at * (PI - at);
  return (sign * 16 * k) / (5 * PI_SQ - 4 * k);
}

export function realismMultiplier(
  config: { realismMultiplier?: number } | undefined,
): number {
  return Math.max(0.05, Math.min(10, config?.realismMultiplier ?? 1));
}

export function rateMultiplier(generation: number, languageId: string): number {
  const seed = fnv1a(languageId) / 0xffffffff;
  const base = 1 + 0.4 * sinApprox(generation / 30 + seed * Math.PI * 2);

  const phase = (generation + Math.floor(seed * 120)) % 120;
  const burst = phase < 5 ? 2 + sinApprox((phase / 5) * Math.PI) : 0;

  return Math.max(0.2, base + burst);
}

export function speakerFactor(speakers: number | undefined): number {
  const n = speakers ?? 10000;
  if (!isFinite(n) || n <= 0) return 1;
  const log10 = Math.log10(Math.max(1, n));
  const factor = Math.pow(0.8, log10 - 4);
  return Math.max(0.4, Math.min(2.2, factor));
}

export function isolationFactor(nearestNeighborDistance: number | undefined): number {
  if (nearestNeighborDistance === undefined || !isFinite(nearestNeighborDistance)) return 1;
  const d = Math.max(0, nearestNeighborDistance);
  return 1 + Math.min(0.6, d / 1000);
}

export function simplificationFactor(speakers: number | undefined): number {
  const n = speakers ?? 10000;
  if (!isFinite(n) || n <= 0) return 1;
  const factor = 1 + 0.5 * Math.log10(Math.max(1, n) / 10000);
  return Math.max(0.5, Math.min(3.0, factor));
}
