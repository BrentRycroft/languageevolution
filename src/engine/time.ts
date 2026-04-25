import { YEARS_PER_GENERATION } from "./constants";

/**
 * Convert a generation count to elapsed years using the simulator's
 * calibration anchor. Defaults to 25 yr/gen — the demographic norm
 * (Pagel 2007, Greenhill 2012).
 */
export function generationToYears(
  generation: number,
  yearsPerGen: number = YEARS_PER_GENERATION,
): number {
  return generation * yearsPerGen;
}

/**
 * Render a generation count as a short human-readable elapsed time.
 * Examples (with default 25 y/gen):
 *   0     → "0 yr"
 *   1     → "25 yr"
 *   40    → "1000 yr"
 *   400   → "10 ky"
 *   4000  → "100 ky"
 *   40000 → "1 my"
 */
export function formatElapsed(
  generation: number,
  yearsPerGen: number = YEARS_PER_GENERATION,
): string {
  const years = generation * yearsPerGen;
  if (years === 0) return "0 yr";
  if (years < 1000) return `${years} yr`;
  if (years < 1_000_000) {
    const ky = years / 1000;
    return ky === Math.floor(ky) ? `${ky} ky` : `${ky.toFixed(1)} ky`;
  }
  const my = years / 1_000_000;
  return my === Math.floor(my) ? `${my} my` : `${my.toFixed(2)} my`;
}

/**
 * Combined gen + elapsed-time label suitable for a header / tooltip.
 * "gen 80 · 2 ky"
 */
export function formatGenWithElapsed(
  generation: number,
  yearsPerGen: number = YEARS_PER_GENERATION,
): string {
  return `gen ${generation} · ${formatElapsed(generation, yearsPerGen)}`;
}
