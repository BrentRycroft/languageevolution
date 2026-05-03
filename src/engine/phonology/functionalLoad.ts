import type { Language, Meaning, Phoneme, WordForm } from "../types";
import { featuresOf } from "./features";
import { stripTone } from "./tone";

/**
 * Phase 27b: functional-load measurement.
 *
 * Functional load is the standard linguistic metric for how indispensable
 * a phoneme is to a language's lexicon: how many distinct meanings would
 * become homophonous if the phoneme merged with its nearest neighbor?
 *
 * A phoneme that uniquely distinguishes 50 minimal pairs (cat/bat,
 * pat/bat, ...) has high functional load and rarely merges in real
 * languages. A phoneme that occurs in many words but never in a context
 * where its merger would create homophones has low functional load and
 * is a prime candidate for next merger.
 *
 * Value range: [0, 1].
 *   0 = merger creates no homophones; phoneme is dispensable.
 *   1 = every occurrence creates a homophone; phoneme is critical.
 *
 * Phase 28b: refactored for performance. The previous implementation
 * called `phonemeFunctionalLoad` once per phoneme, and EACH call rebuilt
 * `existingForms` (~600 word joins) and re-stripped tones for every
 * phoneme position (~600 × 5 strips × 40 phonemes = 120k strips/gen).
 *
 * Now the per-language preparation (`buildLexiconView`) runs once per
 * `functionalLoadMap` call — strips tones, joins form strings, builds
 * the existing-forms set. Per-phoneme work is reduced to a tight loop
 * over pre-stripped bases. ~8-10× faster on a typical 200-gen run.
 *
 * Cached per-generation on `lang.functionalLoadCache` so multiple
 * pruning attempts in one gen share the result.
 */

function featuralDistance(a: Phoneme, b: Phoneme): number {
  if (a === b) return 0;
  const fa = featuresOf(a);
  const fb = featuresOf(b);
  if (!fa || !fb) return Infinity;
  if (fa.type !== fb.type) return Infinity;
  let d = 0;
  if (fa.type === "consonant" && fb.type === "consonant") {
    if (fa.place !== fb.place) d += 1;
    if (fa.manner !== fb.manner) d += 1;
    if (fa.voice !== fb.voice) d += 1;
    if ((fa.aspirated ?? false) !== (fb.aspirated ?? false)) d += 0.5;
    if ((fa.palatalised ?? false) !== (fb.palatalised ?? false)) d += 0.5;
    if ((fa.labialised ?? false) !== (fb.labialised ?? false)) d += 0.5;
  } else if (fa.type === "vowel" && fb.type === "vowel") {
    if (fa.height !== fb.height) d += 1;
    if (fa.backness !== fb.backness) d += 1;
    if (fa.round !== fb.round) d += 0.5;
    if ((fa.long ?? false) !== (fb.long ?? false)) d += 0.5;
    if ((fa.nasal ?? false) !== (fb.nasal ?? false)) d += 0.5;
  }
  return d;
}

function nearestNeighbour(
  candidate: Phoneme,
  inventory: readonly Phoneme[],
): Phoneme | null {
  let best: Phoneme | null = null;
  let bestD = Infinity;
  for (const p of inventory) {
    if (p === candidate) continue;
    const d = featuralDistance(candidate, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  if (bestD <= 2.5) return best;
  return null;
}

interface LexiconView {
  meanings: Meaning[];
  /** Raw form for each meaning (parallel to `meanings`). */
  rawForms: WordForm[];
  /** Per-form, the tone-stripped base of each phoneme position. */
  baseForms: WordForm[];
  /** Per-form, the tone suffix at each phoneme position ("" if none). */
  toneTags: string[][];
  /** Joined raw form-string for collision checks. */
  joined: string[];
  /** Set of every joined raw form-string. */
  existingForms: Set<string>;
}

function buildLexiconView(lang: Language): LexiconView {
  const meanings: Meaning[] = [];
  const rawForms: WordForm[] = [];
  const baseForms: WordForm[] = [];
  const toneTags: string[][] = [];
  const joined: string[] = [];
  const existingForms = new Set<string>();
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m];
    if (!f) continue;
    meanings.push(m);
    rawForms.push(f);
    const bases: Phoneme[] = new Array(f.length);
    const tones: string[] = new Array(f.length);
    for (let i = 0; i < f.length; i++) {
      const raw = f[i]!;
      const base = stripTone(raw);
      bases[i] = base;
      tones[i] = raw.length > base.length ? raw.slice(base.length) : "";
    }
    baseForms.push(bases);
    toneTags.push(tones);
    const j = f.join("");
    joined.push(j);
    existingForms.add(j);
  }
  return { meanings, rawForms, baseForms, toneTags, joined, existingForms };
}

function loadForPhoneme(
  view: LexiconView,
  phoneme: Phoneme,
  neighbour: Phoneme,
): number {
  let withPhoneme = 0;
  let homophonesCreated = 0;
  for (let i = 0; i < view.meanings.length; i++) {
    const bases = view.baseForms[i]!;
    let contains = false;
    for (let j = 0; j < bases.length; j++) {
      if (bases[j] === phoneme) { contains = true; break; }
    }
    if (!contains) continue;
    withPhoneme++;
    // Construct merged string by appending neighbour-with-tone where
    // base === phoneme, else original raw segment. We avoid array
    // allocation by string concatenation directly.
    const tones = view.toneTags[i]!;
    const raw = view.rawForms[i]!;
    let merged = "";
    for (let j = 0; j < bases.length; j++) {
      if (bases[j] === phoneme) merged += neighbour + tones[j]!;
      else merged += raw[j]!;
    }
    if (merged !== view.joined[i]! && view.existingForms.has(merged)) {
      homophonesCreated++;
    }
  }
  if (withPhoneme === 0) return 0;
  return homophonesCreated / withPhoneme;
}

/**
 * Compute the functional load of a single phoneme in a language.
 * Mainly for ad-hoc callers (UI tooltip, tests). The hot-path caller
 * (`functionalLoadMap`) bypasses this to share the lexicon view.
 */
export function phonemeFunctionalLoad(
  lang: Language,
  phoneme: Phoneme,
): number {
  const inv = lang.phonemeInventory.segmental;
  const neighbour = nearestNeighbour(phoneme, inv);
  if (!neighbour) return 0;
  if (!inv.includes(phoneme)) return 0;
  const view = buildLexiconView(lang);
  return loadForPhoneme(view, phoneme, neighbour);
}

/**
 * Compute functional load for every phoneme in the inventory. Caches
 * by generation. Phase 28b: builds the lexicon view once and reuses
 * across all phonemes (was rebuilt per-phoneme pre-28b).
 */
export function functionalLoadMap(
  lang: Language,
  generation: number,
): Record<Phoneme, number> {
  const cache = lang.functionalLoadCache;
  if (cache && cache.generation === generation) {
    return cache.perPhoneme;
  }
  const inv = lang.phonemeInventory.segmental;
  const view = buildLexiconView(lang);
  const out: Record<Phoneme, number> = {};
  for (const p of inv) {
    const neighbour = nearestNeighbour(p, inv);
    out[p] = neighbour ? loadForPhoneme(view, p, neighbour) : 0;
  }
  lang.functionalLoadCache = { generation, perPhoneme: out };
  return out;
}
