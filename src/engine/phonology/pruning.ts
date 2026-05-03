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
  // Weight selection: prefer LOWER functional load.
  const weighted = rareCandidates.map((p) => ({
    phoneme: p,
    weight: 1 - Math.min(1, loads[p] ?? 0),
  }));
  let total = 0;
  for (const w of weighted) total += w.weight;
  let r = rng.next() * total;
  let candidate = weighted[0]!.phoneme;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) {
      candidate = w.phoneme;
      break;
    }
  }
  const neighbour = nearestNeighbour(candidate, inventory);
  if (!neighbour) return null;

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
      lang.lexicon[m] = next;
      affected++;
    }
  }
  lang.phonemeInventory.segmental = inventory.filter((p) => p !== candidate);
  if (lang.inventoryProvenance) {
    delete lang.inventoryProvenance[candidate];
  }
  // Phase 27b: invalidate the functional-load cache after mutation.
  delete lang.functionalLoadCache;
  return affected > 0 ? { from: candidate, to: neighbour, affectedWords: affected } : null;
}
