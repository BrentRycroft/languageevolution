import type { Language, Meaning } from "../types";
import type { Rng } from "../rng";
import { isVowel } from "../phonology/ipa";
import { stripTone } from "../phonology/tone";
import { posOf } from "../lexicon/pos";
import { pushEvent } from "../steps/helpers";

/**
 * Phase 64 T2: ablaut chain emergence + decay.
 *
 * Real strong verbs (English sing/sang/sung, German sehen/sah/gesehen)
 * are not preset features — they emerged historically from regular
 * vowel-stem inflections that became opaque under sound change. The
 * past-tense vowel reflects an ancient apophony pattern (PIE *e/*o/*∅
 * gradation) frozen into a paradigm class.
 *
 * This module:
 *   1. `proposeAblautEmergence(lang, rng, generation)` — per-gen
 *      probabilistic chance to flag a high-frequency verb as
 *      "strong" — joining/founding an ablaut class. The class's
 *      shared ablautMap is registered on the language so multiple
 *      verbs can share it.
 *   2. `decayAblautClasses(lang, generation)` — when an ablaut class
 *      ends up with only 1 verb left (after lexical replacement,
 *      paradigm renewal, or sound-change merger collapsing the
 *      class's vowel contrasts), the class is dissolved and the
 *      verb falls back to regular inflection.
 *
 * Both call sites are wired into the morphological-drift step so
 * ablaut emergence becomes a slow, statistically-realistic
 * background process. Pre-Phase-64 the engine had paradigm.kind:
 * "ablaut" infrastructure but no emergence pathway, so ablaut classes
 * never actually formed.
 */

const ABLAUT_EMERGENCE_BASE_PROB = 0.005; // ~0.5% per gen per language

/** Cross-linguistically common ablaut alternations to seed from. */
const COMMON_ALTERNATIONS: ReadonlyArray<[string, string]> = [
  ["i", "a"],
  ["i", "o"],
  ["e", "a"],
  ["e", "o"],
  ["a", "u"],
  ["iː", "aː"],
  ["e", "i"],
  ["a", "o"],
];

/**
 * Look at a verb's stem vowels; return the first vowel and a
 * cross-linguistically plausible alternant. Returns null if the
 * verb has no vowel or none of the standard alternations are
 * applicable to its inventory.
 */
function pickAlternation(
  lang: Language,
  meaning: Meaning,
  rng: Rng,
): [string, string] | null {
  const form = lang.lexicon[meaning];
  if (!form) return null;
  // Find the first stem vowel that participates in any standard
  // alternation pattern AND whose alternant is in the inventory.
  const inventory = new Set(lang.phonemeInventory.segmental);
  const candidates: Array<[string, string]> = [];
  for (const raw of form) {
    const v = stripTone(raw);
    if (!isVowel(v)) continue;
    for (const [a, b] of COMMON_ALTERNATIONS) {
      if (v === a && inventory.has(b)) candidates.push([a, b]);
      if (v === b && inventory.has(a)) candidates.push([b, a]);
    }
  }
  if (candidates.length === 0) return null;
  return candidates[rng.int(candidates.length)] ?? null;
}

/**
 * Phase 64 T2: try to flag a high-frequency verb as participating in
 * an ablaut class. With small per-gen probability, picks a candidate
 * verb, picks a vowel alternation, and registers the verb in
 * `lang.ablautClassAssignment[meaning] = N` (where N is a class id).
 *
 * The ablaut paradigm itself is registered on
 * `lang.morphology.paradigms` under a pseudo-category derived from
 * the source category (e.g. `verb.tense.past` → ablaut variant). For
 * MVP we co-locate the ablautMap with the existing past-tense
 * paradigm; class membership gates whether the ablaut path fires
 * (regular verbs use the affix; strong verbs use the ablaut).
 */
export function proposeAblautEmergence(
  lang: Language,
  rng: Rng,
  generation: number,
): boolean {
  if (!rng.chance(ABLAUT_EMERGENCE_BASE_PROB)) return false;
  // Need a tense.past paradigm to attach the ablaut variant to.
  const past = lang.morphology.paradigms["verb.tense.past"];
  if (!past) return false;
  // Pick a high-frequency verb that's not already in an ablaut class.
  const candidates: Meaning[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    if (posOf(m) !== "verb") continue;
    if (lang.ablautClassAssignment?.[m]) continue;
    const freq = lang.wordFrequencyHints[m] ?? 0.4;
    if (freq < 0.7) continue; // strong verbs are typically high-freq
    candidates.push(m);
  }
  if (candidates.length === 0) return false;
  const meaning = candidates[rng.int(candidates.length)]!;
  const alt = pickAlternation(lang, meaning, rng);
  if (!alt) return false;
  const [src, dst] = alt;

  // Look for an existing class with the same alternation; reuse it.
  let classId: number | null = null;
  if (past.ablautMap?.[src] === dst) {
    classId = 1; // same key existed; tag verb to class 1 for now
  } else if (!past.ablautMap) {
    past.ablautMap = { [src]: dst };
    classId = 1;
  } else {
    // Different alternation — extend the map; class id increments.
    past.ablautMap[src] = dst;
    classId = Object.keys(past.ablautMap).length;
  }
  if (!lang.ablautClassAssignment) lang.ablautClassAssignment = {};
  lang.ablautClassAssignment[meaning] = classId;

  pushEvent(lang, {
    generation,
    kind: "grammar_shift",
    description: `ablaut emergence: ${meaning} (cls ${classId}) /${src}/ → /${dst}/ in past`,
  });
  return true;
}

/**
 * Phase 64 T2: dissolve an ablaut class when it has only 1 verb left
 * and the source vowel is no longer in the inventory. Untagged verbs
 * fall back to regular inflection.
 */
export function decayAblautClasses(
  lang: Language,
  generation: number,
): void {
  const past = lang.morphology.paradigms["verb.tense.past"];
  if (!past?.ablautMap) return;
  const inventory = new Set(lang.phonemeInventory.segmental);
  const obsoleteSrc: string[] = [];
  for (const src of Object.keys(past.ablautMap)) {
    if (!inventory.has(src)) obsoleteSrc.push(src);
  }
  if (obsoleteSrc.length === 0) return;
  for (const src of obsoleteSrc) {
    delete past.ablautMap[src];
  }
  // If any tagged verbs no longer have a matching ablaut entry,
  // un-tag them.
  if (lang.ablautClassAssignment) {
    for (const m of Object.keys(lang.ablautClassAssignment)) {
      const f = lang.lexicon[m];
      if (!f) continue;
      const hasMatch = f.some((p) => past.ablautMap![stripTone(p)] !== undefined);
      if (!hasMatch) delete lang.ablautClassAssignment[m];
    }
  }
  pushEvent(lang, {
    generation,
    kind: "grammar_shift",
    description: `ablaut decay: ${obsoleteSrc.length} entries dropped (vowels lost from inventory)`,
  });
}
