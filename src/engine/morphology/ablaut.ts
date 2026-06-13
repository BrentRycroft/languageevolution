import type { Language, Meaning, WordForm } from "../types";
import { satGet, satSet, satKeys, satDelete } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { isVowel } from "../phonology/ipa";
import { stripTone } from "../phonology/tone";
import { pushEvent } from "../steps/helpers";
import { idForGloss, lexFormById } from "../lexicon/access";
import { evolvableLexemes, effectivePosOf, effectiveFormOf, effectiveGlossFor } from "../lexicon/evolvable";
import type { LexemeId } from "../lexicon/lexemeIdentity";

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
 * Phase 5d: vowel alternations the language has actually RECORDED via its
 * vowel sound-changes (vowel_shift / vowel_reduction / harmony rule outputMaps).
 * Real strong verbs freeze an ancient sound change into a paradigm, so an
 * ablaut class should reflect THIS language's history rather than a fixed
 * IE-ablaut template. Empty when no vowel change is on record.
 */
function recordedAlternations(lang: Language): Map<string, string> {
  const out = new Map<string, string>();
  const rules = [...(lang.activeRules ?? []), ...(lang.retiredRules ?? [])];
  for (const r of rules) {
    if (r.family !== "vowel_shift" && r.family !== "vowel_reduction" && r.family !== "harmony") {
      continue;
    }
    for (const [from, to] of Object.entries(r.outputMap)) {
      if (from === to || !isVowel(from) || !isVowel(to)) continue;
      if (!out.has(from)) out.set(from, to);
    }
  }
  return out;
}

/**
 * Look at a verb's stem vowels; return the first vowel and a plausible
 * alternant. Phase 5d: PREFER an alternation fossilised from the language's own
 * recorded vowel sound-changes; fall back to the cross-linguistic template only
 * when the language has no vowel change on record. Returns null if the verb has
 * no vowel or no applicable alternation whose alternant is in the inventory.
 */
function pickAlternation(
  lang: Language,
  meaning: Meaning,
  rng: Rng,
  suppliedForm?: WordForm,
): [string, string] | null {
  const _id = idForGloss(lang, meaning);
  const form = suppliedForm ?? (_id !== undefined ? lexFormById(lang, _id) : undefined);
  if (!form) return null;
  const inventory = new Set(lang.phonemeInventory.segmental);

  // Phase 5d: recorded sound-change alternations take precedence.
  const recorded = recordedAlternations(lang);
  if (recorded.size > 0) {
    const recCands: Array<[string, string]> = [];
    for (const raw of form) {
      const v = stripTone(raw);
      if (!isVowel(v)) continue;
      const alt = recorded.get(v);
      if (alt && inventory.has(alt)) recCands.push([v, alt]);
    }
    if (recCands.length > 0) return recCands[rng.int(recCands.length)] ?? null;
  }

  // Fallback: cross-linguistically common template alternations.
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
  const candidates: LexemeId[] = [];
  for (const id of evolvableLexemes(lang)) {
    if (effectivePosOf(lang, id) !== "verb") continue;
    if (satGet(lang, "ablautClassAssignment", id)) continue;
    const freq = satGet(lang, "wordFrequencyHints", id) ?? 0.4;
    if (freq < 0.7) continue; // strong verbs are typically high-freq
    candidates.push(id);
  }
  if (candidates.length === 0) return false;
  const targetId = candidates[rng.int(candidates.length)]!;
  const meaning = effectiveGlossFor(lang, targetId); // display + alternation key
  const alt = pickAlternation(lang, meaning, rng, effectiveFormOf(lang, targetId));
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
  satSet(lang, "ablautClassAssignment", targetId, classId);

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
    for (const id of satKeys(lang, "ablautClassAssignment")) {
      const f = lang.lexemes[id]?.form;
      if (!f) continue;
      const hasMatch = f.some((p) => past.ablautMap![stripTone(p)] !== undefined);
      if (!hasMatch) satDelete(lang, "ablautClassAssignment", id);
    }
  }
  pushEvent(lang, {
    generation,
    kind: "grammar_shift",
    description: `ablaut decay: ${obsoleteSrc.length} entries dropped (vowels lost from inventory)`,
  });
}
