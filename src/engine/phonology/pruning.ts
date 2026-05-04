import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { featuresOf } from "./features";
import { stripTone } from "./tone";
import { functionalLoadMap } from "./functionalLoad";

const MAX_RARE_OCCURRENCES = 2;
const MIN_INVENTORY_TO_PRUNE = 12;
const LOW_LOAD_THRESHOLD = 0.05; // ≤5% homophone-creation rate is "low load"

function countOccurrences(lang: Language): Map<Phoneme, number> {
  const counts = new Map<Phoneme, number>();
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m]!;
    for (const raw of f) {
      const p = stripTone(raw);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  return counts;
}

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

// IPA diacritics commonly applied to base phonemes by sound-change
// rules: aspirated, palatalised, labialised, pharyngealised, glottal,
// long, nasal. Stripping these maps a complex phoneme back to its
// likely base (`tʷʲ` → `t`, `aː` → `a`, `ẽ` → `e`).
const DIACRITICS = /[ʷʲʰˤˀːˑ̥̩̯̃̊]/g;

function stripDiacritics(p: string): string {
  const stripped = stripTone(p).replace(DIACRITICS, "");
  return stripped || p;
}

function nearestNeighbour(
  candidate: Phoneme,
  inventory: Phoneme[],
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
  if (bestD <= 1.5) return best;
  // Phase 27.1 fallback 1: strip diacritics and look up the base.
  const base = stripDiacritics(candidate);
  if (base !== candidate && base.length > 0 && inventory.includes(base)) {
    return base;
  }
  // Phase 27.1 fallback 2: pick the inventory phoneme sharing the
  // longest base prefix (after diacritic stripping). Catches cases
  // where the base itself isn't in the inventory but a featurally
  // adjacent variant is.
  let prefBest: Phoneme | null = null;
  let prefLen = 0;
  const cb = stripDiacritics(candidate);
  for (const p of inventory) {
    if (p === candidate) continue;
    const pb = stripDiacritics(p);
    let i = 0;
    while (i < pb.length && i < cb.length && pb[i] === cb[i]) i++;
    if (i > prefLen) {
      prefLen = i;
      prefBest = p;
    }
  }
  if (prefBest && prefLen > 0) return prefBest;
  // Phase 27.1 fallback 3: any closest-by-feature neighbour, no
  // distance cap. Better an ugly merger than runaway inventory growth.
  if (best) return best;
  return null;
}

export interface PhonemeMerger {
  from: Phoneme;
  to: Phoneme;
  affectedWords: number;
}

export function prunePhonemes(
  lang: Language,
  rng: Rng,
  generation: number = 0,
): PhonemeMerger | null {
  const inventory = lang.phonemeInventory.segmental;
  if (inventory.length < MIN_INVENTORY_TO_PRUNE) return null;
  const counts = countOccurrences(lang);
  const rareCandidates: Phoneme[] = [];
  for (const p of inventory) {
    const n = counts.get(p) ?? 0;
    if (n > 0 && n <= MAX_RARE_OCCURRENCES) rareCandidates.push(p);
  }
  // Phase 27b: also include LOW-FUNCTIONAL-LOAD phonemes regardless
  // of raw count. A phoneme used in 50 words but always in
  // free-variation positions (no homophones created on merger) is
  // a much better candidate than one used in 2 words that distinguish
  // critical contrasts.
  const loads = functionalLoadMap(lang, generation);
  for (const p of inventory) {
    if (rareCandidates.includes(p)) continue;
    const load = loads[p] ?? 0;
    if (load <= LOW_LOAD_THRESHOLD) rareCandidates.push(p);
  }
  if (rareCandidates.length === 0) return null;
  // Weight selection: prefer LOWER functional load. Walk candidates in
  // weighted-random order until we find one whose nearestNeighbour is
  // non-null. Phase 27.1: previously we picked one candidate up front
  // and bailed if its neighbour was null — losing the whole attempt
  // and letting un-mergeable phonemes stay un-mergeable forever.
  const remaining = rareCandidates.map((p) => ({
    phoneme: p,
    weight: 1 - Math.min(1, loads[p] ?? 0),
  }));
  let candidate: Phoneme | null = null;
  let neighbour: Phoneme | null = null;
  while (remaining.length > 0) {
    const total = remaining.reduce((s, w) => s + w.weight, 0);
    if (total <= 0) break;
    let r = rng.next() * total;
    let pickIdx = 0;
    for (let i = 0; i < remaining.length; i++) {
      r -= remaining[i]!.weight;
      if (r <= 0) {
        pickIdx = i;
        break;
      }
    }
    const pick = remaining[pickIdx]!;
    remaining.splice(pickIdx, 1);
    const n = nearestNeighbour(pick.phoneme, inventory);
    if (n) {
      candidate = pick.phoneme;
      neighbour = n;
      break;
    }
  }
  if (!candidate || !neighbour) return null;

  let affected = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m]!;
    let changed = false;
    const next: WordForm = form.map((raw) => {
      const tone = raw.length > stripTone(raw).length ? raw.slice(stripTone(raw).length) : "";
      const base = stripTone(raw);
      if (base === candidate) {
        changed = true;
        return neighbour + tone;
      }
      return raw;
    });
    if (changed) {
      // Direct lexicon write — sync of lang.words happens once at
      // end-of-step in stepInventoryManagement to amortise the cost
      // across all per-gen pruning attempts. See Phase 29 Tranche 7b
      // notes in pruning + inventoryManagement.
      lang.lexicon[m] = next;
      affected++;
    }
  }
  lang.phonemeInventory.segmental = inventory.filter((p) => p !== candidate);
  if (lang.inventoryProvenance) {
    delete lang.inventoryProvenance[candidate];
  }
  // Phase 27.1: previously we deleted `lang.functionalLoadCache` here
  // so subsequent pruning calls in the same generation would see
  // post-merger loads. That made multi-attempt homeostasis loops
  // O(N²×W) per generation. The cache key is generation-based, so it
  // is invalidated naturally each new gen — minor intra-gen staleness
  // is an acceptable tradeoff for the speedup.
  if (lang.functionalLoadCache) {
    delete lang.functionalLoadCache.perPhoneme[candidate];
  }
  // Phase 27.1: even when affected === 0 (the candidate was a phantom
  // — in segmental but not in any lexicon entry, e.g. left over from
  // an areal share whose lexicon edits got overwritten), the inventory
  // shrunk. Report the prune so callers don't bail thinking nothing
  // happened.
  return { from: candidate, to: neighbour, affectedWords: affected };
}
