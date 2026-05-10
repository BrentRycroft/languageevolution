import type { Language, Phoneme, WordForm } from "../types";
import type { Rng } from "../rng";
import { featuresOf } from "./features";
import { stripTone, capToneStacking } from "./tone";
import { isFormLegal } from "./wordShape";
import { functionalLoadMap, phonemeFunctionalLoad } from "./functionalLoad";
import { SWADESH_LIST } from "../semantics/lexicostat";
import { areMeaningsRelated } from "../lexicon/word";

const MAX_RARE_OCCURRENCES = 2;
const MIN_INVENTORY_TO_PRUNE = 12;
const LOW_LOAD_THRESHOLD = 0.05; // ≤5% homophone-creation rate is "low load"

/**
 * Phase 62: cap on how many NEW unrelated-meaning homonym pairs a
 * single merger may create. The functional-load gate above
 * (FL_INHIBIT_THRESHOLD) protects against generally high-load
 * candidates, but a particular candidate→neighbour pairing can still
 * collapse hundreds of contrasts even when the global load is low.
 *
 * User observation (gen-100 Romance probe): /b/→/d/ at gen 21 affected
 * 967 words; subsequent /d/→/b/ at gen 84 affected 1185 words; words
 * like "babeː" ended up as 4-way homonyms ("dog | bread | ship | if").
 * Real diachronic mergers are blocked or chain-shifted when too many
 * minimal pairs would collapse. This cap models that selection pressure.
 *
 * Tuning: max(8 absolute, 0.5% of lexicon) — for a 500-word lexicon,
 * that's 8 new homonyms; for a 5000-word lexicon, 25.
 */
const HOMONYM_COLLISION_ABS_CAP = 8;
const HOMONYM_COLLISION_REL_CAP = 0.005;

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

/**
 * Phase 69a T2 + T4: pruning context is reused across multiple
 * prunePhonemes calls within a single runHomeostasis loop iteration.
 * Pre-fix the function rebuilt `formKeyToMeanings` (full lexicon
 * scan) AND called `functionalLoadMap` (another full scan) on EVERY
 * call; with up to 5 attempts per gen on high-pressure gens, that's
 * ~10× redundant scans.
 *
 * The caller (runHomeostasis) builds this once and reuses across
 * the prune loop. Both fields are optional for back-compat with any
 * external caller; when omitted, prunePhonemes computes them
 * locally as before.
 */
export interface PrunePhonemesContext {
  /** Map from `lang.lexicon[m].join("|")` → list of meanings sharing
   *  that surface form. Read by the Phase 62 homonym pre-flight. */
  formKeyToMeanings?: Map<string, string[]>;
  /** Per-phoneme functional-load score from `functionalLoadMap`. */
  loads?: Record<Phoneme, number>;
}

export function prunePhonemes(
  lang: Language,
  rng: Rng,
  generation: number = 0,
  ctx: PrunePhonemesContext = {},
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
  const loads = ctx.loads ?? functionalLoadMap(lang, generation);
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

  // Phase 62: pre-flight homonym-collision count. Simulate the
  // substitution against every candidate-bearing word and count how
  // many would land on an existing form whose meaning is unrelated
  // to the substituted word's meaning. Reject the merger when this
  // exceeds HOMONYM_COLLISION_ABS_CAP or HOMONYM_COLLISION_REL_CAP,
  // whichever is higher.
  //
  // Sound-change-induced homonymy is real and OK in moderation
  // (English "to / too / two", "bear / bare"), but a single merger
  // that creates hundreds of new homonyms is the runaway-merger
  // failure mode that drove the user's complaint. This guards
  // against it without blocking legitimate small-scale mergers.
  {
    // Phase 69a T2: reuse the form-key map across multiple
    // prunePhonemes attempts in the same runHomeostasis pass. The
    // caller may pass `ctx.formKeyToMeanings` to skip the O(W)
    // rebuild on each call.
    let formKeyToMeanings = ctx.formKeyToMeanings;
    if (!formKeyToMeanings) {
      formKeyToMeanings = new Map();
      for (const m of Object.keys(lang.lexicon)) {
        const f = lang.lexicon[m]!;
        const key = f.join("|");
        if (!formKeyToMeanings.has(key)) formKeyToMeanings.set(key, []);
        formKeyToMeanings.get(key)!.push(m);
      }
    }
    let projectedCollisions = 0;
    const collisionCap = Math.max(
      HOMONYM_COLLISION_ABS_CAP,
      Math.ceil(Object.keys(lang.lexicon).length * HOMONYM_COLLISION_REL_CAP),
    );
    for (const m of Object.keys(lang.lexicon)) {
      const form = lang.lexicon[m]!;
      let hasCand = false;
      for (const raw of form) if (stripTone(raw) === candidate) { hasCand = true; break; }
      if (!hasCand) continue;
      const freq = lang.wordFrequencyHints?.[m] ?? 0.5;
      if (freq >= PRUNE_FREQ_PROTECT_THRESHOLD && SWADESH_CORE_SET.has(m)) continue;
      const projected: WordForm = form.map((raw) => {
        const tone = raw.length > stripTone(raw).length ? raw.slice(stripTone(raw).length) : "";
        const base = stripTone(raw);
        return base === candidate ? capToneStacking(neighbour + tone) : raw;
      });
      const newKey = projected.join("|");
      const existing = formKeyToMeanings.get(newKey);
      if (!existing) continue;
      // Walk the existing meanings on this surface: collision if any
      // is a different lemma with an unrelated meaning.
      for (const otherM of existing) {
        if (otherM === m) continue;
        if (!areMeaningsRelated(lang, m, otherM)) {
          projectedCollisions++;
          break;
        }
      }
      if (projectedCollisions > collisionCap) break;
    }
    if (projectedCollisions > collisionCap) {
      lang.functionalLoadInhibitions =
        (lang.functionalLoadInhibitions ?? 0) + 1;
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
  // Phase 63: extend verbThemes with mutated variants alongside the
  // proto themes. Swadesh-protected lemmas may keep the pre-merger
  // theme shape (e.g. /komedeɾe/ "eat" stays put while /ɾ/ → /b/
  // fires across non-protected vocab), so we keep BOTH the proto
  // theme and the post-merger form available as match candidates at
  // strip time. Proto themes (the originally seeded ones) are
  // preserved at the head of the list and never evicted.
  if (lang.grammar.verbThemes && lang.grammar.verbThemes.length > 0) {
    const updated: typeof lang.grammar.verbThemes = lang.grammar.verbThemes.slice();
    for (const theme of lang.grammar.verbThemes) {
      const next = theme.map((raw) => {
        const tone = raw.length > stripTone(raw).length ? raw.slice(stripTone(raw).length) : "";
        const base = stripTone(raw);
        return base === candidate ? capToneStacking(neighbour + tone) : raw;
      });
      const isDup =
        next.length === theme.length && next.every((p, i) => p === theme[i]);
      if (isDup) continue;
      const alreadyHas = updated.some(
        (t) => t.length === next.length && t.every((p, i) => p === next[i]),
      );
      if (!alreadyHas) updated.push(next);
    }
    lang.grammar.verbThemes = updated;
  }

  // Phase 72c T2 (verb-theme reanalysis): drop verbThemes that no
  // longer match ANY verb in the lexicon. Pre-72c, when a deletion
  // rule eroded a theme suffix (e.g., /ɾ/ deleted intervocalically,
  // breaking the /eɾe/ theme), the theme stayed in lang.grammar
  // forever, never matching any verb at strip time — silent dead
  // weight. We retain the original proto themes anyway (head-of-list
  // protection in the loop above), but stale post-merger variants
  // that fail every match across the lexicon get pruned.
  if (lang.grammar.verbThemes && lang.grammar.verbThemes.length > 1) {
    // Find verbs in the lexicon: meanings with a "verb." paradigm
    // category match and lexicon entries.
    const verbForms: WordForm[] = [];
    for (const m of Object.keys(lang.lexicon)) {
      // Heuristic: any meaning that's a verb in CONCEPTS or has POS=V.
      // We check the lexicon directly here without a CONCEPTS import to
      // avoid circular imports; assume any lexicon entry MAY be a verb.
      const f = lang.lexicon[m];
      if (f && f.length > 0) verbForms.push(f);
    }
    const matchedAtLeastOne = (theme: WordForm) => {
      if (theme.length === 0) return false;
      for (const f of verbForms) {
        if (f.length < theme.length) continue;
        let ok = true;
        for (let i = 0; i < theme.length; i++) {
          if (f[f.length - theme.length + i] !== theme[i]) { ok = false; break; }
        }
        if (ok) return true;
      }
      return false;
    };
    // Always preserve the FIRST theme (head-of-list = proto). Only
    // prune secondary entries that fail to match anything.
    const head = lang.grammar.verbThemes[0]!;
    const tail = lang.grammar.verbThemes.slice(1).filter(matchedAtLeastOne);
    lang.grammar.verbThemes = [head, ...tail];
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
