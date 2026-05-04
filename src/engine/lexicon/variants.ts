import type { Language, Meaning, WordForm } from "../types";
import { setLexiconForm } from "./mutate";

const MAX_VARIANTS = 3;
const DEFAULT_DECAY = 0.85;
const PRUNE_THRESHOLD = 0.08;
const NEW_VARIANT_WEIGHT = 0.4;
const RETAINED_BOOST = 0.6;

function formsEqual(a: WordForm, b: WordForm): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function recordVariant(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
  generation: number,
  weight = NEW_VARIANT_WEIGHT,
): void {
  if (!lang.variants) lang.variants = {};
  const existing = lang.variants[meaning] ?? [];
  for (let i = 0; i < existing.length; i++) {
    if (formsEqual(existing[i]!.form, form)) {
      existing[i]!.weight = Math.min(1, existing[i]!.weight + weight);
      return;
    }
  }
  existing.push({ form: form.slice(), weight, bornGeneration: generation });
  if (existing.length > MAX_VARIANTS) {
    existing.sort((a, b) => b.weight - a.weight);
    existing.length = MAX_VARIANTS;
  }
  lang.variants[meaning] = existing;
}

export function reinforceCanonical(
  lang: Language,
  meaning: Meaning,
  form: WordForm,
): void {
  if (!lang.variants) return;
  const list = lang.variants[meaning];
  if (!list) return;
  for (let i = 0; i < list.length; i++) {
    if (formsEqual(list[i]!.form, form)) {
      list[i]!.weight = Math.min(1, list[i]!.weight + RETAINED_BOOST * 0.3);
    }
  }
}

export interface ActuationResult {
  meaning: Meaning;
  fromForm: WordForm;
  toForm: WordForm;
}

export function decayAndActuate(
  lang: Language,
  generation: number,
  decay = DEFAULT_DECAY,
): ActuationResult[] {
  if (!lang.variants) return [];
  const actuations: ActuationResult[] = [];
  const meanings = Object.keys(lang.variants);
  for (const m of meanings) {
    const list = lang.variants[m]!;
    const canonical = lang.lexicon[m];
    for (let i = 0; i < list.length; i++) {
      const v = list[i]!;
      if (canonical && formsEqual(v.form, canonical)) {
        v.weight = Math.min(1, v.weight + RETAINED_BOOST * 0.05);
      } else {
        v.weight *= decay;
      }
    }
    let survivors = list;
    let needFilter = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i]!.weight < PRUNE_THRESHOLD) { needFilter = true; break; }
    }
    if (needFilter) {
      survivors = list.filter((v) => v.weight >= PRUNE_THRESHOLD);
    }
    if (survivors.length === 0) {
      delete lang.variants[m];
      continue;
    }
    survivors.sort((a, b) => b.weight - a.weight);
    const top = survivors[0]!;
    if (canonical && !formsEqual(top.form, canonical) && top.weight > 0.5 && generation - top.bornGeneration >= 2) {
      actuations.push({ meaning: m, fromForm: canonical.slice(), toForm: top.form.slice() });
      // Phase 29 Tranche 1 round 2: route through chokepoint.
      setLexiconForm(lang, m, top.form.slice(), { bornGeneration: generation, origin: "variant-actuation" });
    }
    lang.variants[m] = survivors;
  }
  if (Object.keys(lang.variants).length === 0) delete lang.variants;
  return actuations;
}
