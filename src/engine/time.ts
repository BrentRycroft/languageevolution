import { YEARS_PER_GENERATION } from "./constants";

export function generationToYears(
  generation: number,
  yearsPerGen: number = YEARS_PER_GENERATION,
): number {
  return generation * yearsPerGen;
}

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

export function formatGenWithElapsed(
  generation: number,
  yearsPerGen: number = YEARS_PER_GENERATION,
): string {
  return `gen ${generation} · ${formatElapsed(generation, yearsPerGen)}`;
}
