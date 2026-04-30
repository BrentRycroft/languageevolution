import type { Language, Meaning, WordForm } from "../types";

const MAX_VARIANTS = 3;
const DEFAULT_DECAY = 0.85;
const PRUNE_THRESHOLD = 0.08;
const NEW_VARIANT_WEIGHT = 0.4;
const RETAINED_BOOST = 0.6;

function formKey(form: WordForm): string {
  return form.join(" ");
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
  const key = formKey(form);
  const idx = existing.findIndex((v) => formKey(v.form) === key);
  if (idx >= 0) {
    existing[idx]!.weight = Math.min(1, existing[idx]!.weight + weight);
    return;
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
  const key = formKey(form);
  for (const v of list) {
    if (formKey(v.form) === key) {
      v.weight = Math.min(1, v.weight + RETAINED_BOOST * 0.3);
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
    const canonicalKey = canonical ? formKey(canonical) : null;
    for (const v of list) {
      if (canonicalKey && formKey(v.form) === canonicalKey) {
        v.weight = Math.min(1, v.weight + RETAINED_BOOST * 0.05);
      } else {
        v.weight *= decay;
      }
    }
    const survivors = list.filter((v) => v.weight >= PRUNE_THRESHOLD);
    if (survivors.length === 0) {
      delete lang.variants[m];
      continue;
    }
    survivors.sort((a, b) => b.weight - a.weight);
    const top = survivors[0]!;
    const topKey = formKey(top.form);
    if (canonical && topKey !== canonicalKey && top.weight > 0.5 && generation - top.bornGeneration >= 2) {
      actuations.push({ meaning: m, fromForm: canonical.slice(), toForm: top.form.slice() });
      lang.lexicon[m] = top.form.slice();
    }
    lang.variants[m] = survivors;
  }
  if (Object.keys(lang.variants).length === 0) delete lang.variants;
  return actuations;
}
