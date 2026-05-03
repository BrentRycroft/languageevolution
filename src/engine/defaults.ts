import type { Language } from "./types";

/**
 * Phase 28a: consolidated defaults for optional Language fields.
 * Pre-28a these were inlined as `??` chains scattered across ~20
 * call-sites. Each site repeated the fallback (e.g. `lang.stressPattern
 * ?? "penult"`), occasionally diverging (different files defaulted
 * `culturalTier` to 0 vs implicit `?? 0` clamp).
 *
 * Use these helpers everywhere a field is read with a fallback so
 * defaults are guaranteed consistent.
 */

export function defaultStressPattern(): NonNullable<Language["stressPattern"]> {
  return "penult";
}

export function effectiveStressPattern(
  lang: Pick<Language, "stressPattern">,
): NonNullable<Language["stressPattern"]> {
  return lang.stressPattern ?? defaultStressPattern();
}

export function defaultTier(): 0 | 1 | 2 | 3 {
  return 0;
}

export function effectiveTier(
  lang: Pick<Language, "culturalTier">,
): 0 | 1 | 2 | 3 {
  return (lang.culturalTier ?? defaultTier()) as 0 | 1 | 2 | 3;
}

export function defaultPhonotacticProfile(): NonNullable<
  Language["phonotacticProfile"]
> {
  return {
    maxOnset: 3,
    maxCoda: 4,
    maxCluster: 4,
    strictness: 0.4,
  };
}

export function effectivePhonotacticProfile(
  lang: Pick<Language, "phonotacticProfile">,
): NonNullable<Language["phonotacticProfile"]> {
  return lang.phonotacticProfile ?? defaultPhonotacticProfile();
}
