import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { featuresOf } from "./features";
import { stripTone, capToneStacking } from "./tone";
import { isFormLegal } from "./wordShape";
import { functionalLoadMap, phonemeFunctionalLoad } from "./functionalLoad";
import { SWADESH_LIST } from "../semantics/lexicostat";

const MAX_RARE_OCCURRENCES = 2;
const MIN_INVENTORY_TO_PRUNE = 12;
const LOW_LOAD_THRESHOLD = 0.05; // ≤5% homophone-creation rate is "low load"

/** Phase 48 D4-A: pairwise functional-load merger-inhibition gate.
 *  Loads above this threshold are subject to probabilistic rejection.
 *  0.20 = 20% homophone-creation rate; mergers above this rate would
 *  collapse meaningful contrasts. */
const FL_INHIBIT_THRESHOLD = 0.20;

/** Phase 48 D4-A: gain on the rejection probability. With this gain,
 *  load 0.20 → 0% reject (at threshold); load 1.0 → 80% reject. */
const FL_INHIBIT_GAIN = 1.0;

// Phase 40a: Swadesh-100 protection during homeostatic pruning.
// Pre-Phase-40 pruning rewrote every word containing the candidate
// phoneme in a single gen, bypassing Wang sigmoid + freq tilt +
// Swadesh hard brake. Now: high-freq Swadesh words skip the merger
// (they drift through the gated phonology pipeline at their own
// pace). Low-freq + non-core words still flash-merge — those would
// have diffused in a few gens anyway, so the speedup is realistic.
// Inventory removal is conditional on no Swadesh words remaining
// with the candidate; otherwise the phoneme stays in inventory.
const PRUNE_FREQ_PROTECT_THRESHOLD = 0.85;
const SWADESH_CORE_SET: ReadonlySet<string> = new Set(SWADESH_LIST);

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

  // Phase 48 D4-A: pairwise functional-load inhibition. Even when a
  // low-load candidate is picked by the weighted-random selection
  // above, the SPECIFIC merger of (candidate → neighbour) may still
  // collapse a high-load contrast. Compute the pairwise load and
  // reject the merger probabilistically when it would erase a lot
  // of minimal pairs. Linguistic basis: Surendran & Niyogi 2003;
  // Wedel et al. 2013 — high-functional-load contrasts resist
  // diachronic merger.
  const pairwiseLoad = phonemeFunctionalLoad(lang, candidate);
  // The candidate's load is already the merger's homophone-creation
  // rate (loadForPhoneme returns homophones/withPhoneme), so it IS
  // pairwise vs. its nearest neighbour.
  if (pairwiseLoad > FL_INHIBIT_THRESHOLD) {
    const inhibitP = Math.min(0.85, (pairwiseLoad - FL_INHIBIT_THRESHOLD) * FL_INHIBIT_GAIN);
    if (rng.chance(inhibitP)) {
      lang.functionalLoadInhibitions = (lang.functionalLoadInhibitions ?? 0) + 1;
      return null;
    }
  }

  let affected = 0;
  let swadeshSkipped = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[m]!;
    // Phase 40a: skip Swadesh-core high-freq words. They keep the
    // candidate phoneme; the gated phonology pipeline handles their
    // drift over many gens via the Wang sigmoid + freq tilt.
    let containsCandidate = false;
    for (const raw of form) {
      if (stripTone(raw) === candidate) { containsCandidate = true; break; }
    }
    if (!containsCandidate) continue;
    const freq = lang.wordFrequencyHints?.[m] ?? 0.5;
    if (freq >= PRUNE_FREQ_PROTECT_THRESHOLD && SWADESH_CORE_SET.has(m)) {
      swadeshSkipped++;
      continue;
    }
    let changed = false;
    const next: WordForm = form.map((raw) => {
      const tone = raw.length > stripTone(raw).length ? raw.slice(stripTone(raw).length) : "";
      const base = stripTone(raw);
      if (base === candidate) {
        changed = true;
        // Phase 30 Tranche 30a: cap any preserved tone stack on the
        // post-merger phoneme.
        return capToneStacking(neighbour + tone);
      }
      return raw;
    });
    if (changed) {
      // Phase 31 follow-up: if the merger eliminates the only
      // syllabic nucleus (e.g., l̩ → l, i → j collapses), reject the
      // change for this word — keep the pre-merger form. Pre-fix
      // pruning could leave words with no syllable nucleus
      // (`dʰdʰθgʲʰ` for "long" in a PIE leaf), violating
      // isFormLegal on the lexicon level. The inventory still gets
      // the candidate dropped at the end of this function.
      if (!isFormLegal(m, next)) continue;
      // Direct lexicon write — sync of lang.words happens once at
      // end-of-step in stepInventoryManagement to amortise the cost
      // across all per-gen pruning attempts. See Phase 29 Tranche 7b
      // notes in pruning + inventoryManagement.
      lang.lexicon[m] = next;
      affected++;
    }
  }
  // Phase 40a: only shrink inventory when no Swadesh words still
  // hold the candidate. Otherwise the phoneme stays and the
  // protected words keep it, drifting independently via the gated
  // phonology pipeline. Prevents the "phantom phoneme" pattern where
  // pruning declares /X/ removed but Swadesh forms still contain it.
  if (swadeshSkipped === 0) {
    lang.phonemeInventory.segmental = inventory.filter((p) => p !== candidate);
    if (lang.inventoryProvenance) {
      delete lang.inventoryProvenance[candidate];
    }
    if (lang.functionalLoadCache) {
      delete lang.functionalLoadCache.perPhoneme[candidate];
    }
  }
  // Phase 27.1: even when affected === 0 (the candidate was a phantom
  // — in segmental but not in any lexicon entry, e.g. left over from
  // an areal share whose lexicon edits got overwritten), the inventory
  // shrunk. Report the prune so callers don't bail thinking nothing
  // happened.
  return { from: candidate, to: neighbour, affectedWords: affected };
}
