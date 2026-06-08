import type { Language, Meaning } from "../types";
import { satSet } from "./satellites";
import type { Rng } from "../rng";
import { relatedMeanings } from "../semantics/clusters";
import { neighborsOf } from "../semantics/neighbors";
import { isFormLegal } from "../phonology/wordShape";
import { setLexiconForm } from "./mutate";
import { isClosedClass, posOf } from "./pos";
import { lexFormById, lexHasById, lexIds, idForGloss } from "./access";
import { meaningForLexemeId } from "./lexemeIdentity";
import { recordedParts } from "./word";

/**
 * taboo.ts
 *
 * Concept registry, tier ladder, frequency dynamics, derivational suffixes, taboo handling, lexicon shape. Key exports: TabooEvent, maybeTabooReplace.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export interface TabooEvent {
  meaning: Meaning;
  oldForm: string;
  newForm: string;
  donor: Meaning | null;
}

/**
 * Evolution-realism Phase 3d: taboo replacement targets culturally
 * DANGEROUS REFERENTS, not high-frequency words. Cross-linguistically,
 * word taboo + avoidance/replacement clusters on death, the supernatural,
 * predators/dangerous animals, disease/bodily affliction, and sacred /
 * sexual / in-law terms (the "noa" vocabularies). The old gate
 * (freq ≥ 0.7) wrongly tabooed go/take/want/see. Only concepts in this
 * curated set are eligible; most generations find no eligible target —
 * which is correct, taboo replacement is occasional, not constant.
 */
const TABOO_REFERENTS: ReadonlySet<Meaning> = new Set<Meaning>([
  // death & the dead
  "die", "dead", "death", "corpse", "grave", "tomb", "bury", "funeral",
  "ghost", "spirit", "soul", "ancestor",
  // the supernatural / sacred
  "god", "devil", "demon", "spirit", "sacred", "holy", "curse", "witch",
  "magic", "ritual", "sacrifice", "taboo",
  // predators & dangerous animals
  "snake", "serpent", "bear", "wolf", "lion", "tiger", "spider",
  "scorpion", "shark", "crocodile",
  // disease & affliction
  "disease", "sick", "illness", "plague", "fever", "wound", "blood",
  "pus", "rot",
  // sexual / bodily / in-law (the most strongly avoided)
  "sex", "penis", "vagina", "menstruation", "birth", "mother-in-law",
  "father-in-law",
]);

/** Returns true if `meaning` is a culturally-dangerous referent subject to taboo replacement. */
export function isTabooReferent(meaning: Meaning): boolean {
  return TABOO_REFERENTS.has(meaning);
}

export function maybeTabooReplace(
  lang: Language,
  rng: Rng,
  probability: number,
): TabooEvent | null {
  if (!rng.chance(probability)) return null;
  const candidates: Meaning[] = [];
  for (const id of lexIds(lang)) {
    const m = meaningForLexemeId(lang, id);
    if (m === undefined) continue;
    // Phase 3d: only culturally-dangerous referents attract taboo
    // replacement (death / supernatural / predator / disease / sex / in-law),
    // not merely high-frequency words. Most generations find none eligible.
    if (!TABOO_REFERENTS.has(m)) continue;
    // Concept-native (item 4): skip words with RECORDED compound/derivation
    // structure, read from lang.compounds, rather than guessing from a hyphen in
    // the English gloss. (Taboo targets simple content roots; compounds
    // are excluded either way — it just stops trusting gloss spelling.)
    if (recordedParts(lang, m) !== null) continue;
    // Phase 26c: closed-class words (DET, AUX, PREP, CONJ, PRON, NEG, COP)
    // are NOT subject to taboo replacement. Real languages don't taboo
    // their function words — taboo affects content words tied to
    // dangerous referents (gods, predators, dead persons), never
    // articles or conjunctions.
    if (isClosedClass(posOf(m))) continue;
    candidates.push(m);
  }
  if (candidates.length === 0) return null;
  const target = candidates[rng.int(candidates.length)]!;
  const targetId = idForGloss(lang, target)!;
  const oldForm = lexFormById(lang, targetId)!;
  const oldFormStr = oldForm.join("");

  const relatedPool = new Set<string>([
    ...relatedMeanings(target),
    ...neighborsOf(target),
  ]);
  const donors = Array.from(relatedPool).filter((n) => {
    if (n === target) return false;
    const nid = idForGloss(lang, n);
    return nid !== undefined && lexHasById(lang, nid);
  });

  let newForm = oldForm.slice();
  let donor: Meaning | null = null;
  if (donors.length > 0 && rng.chance(0.7)) {
    donor = donors[rng.int(donors.length)]!;
    const donorId = idForGloss(lang, donor)!;
    const donorForm = lexFormById(lang, donorId)!;
    const softener = ["e", "ə"][rng.int(2)]!;
    newForm = [...donorForm, softener];
  } else {
    newForm = [...oldForm, ...oldForm.slice(0, 2)];
  }

  if (newForm.length > 9) newForm = newForm.slice(0, 9);
  if (!isFormLegal(target, newForm)) return null;

  // Phase 29 Tranche 1a: route through chokepoint so words stays in sync.
  setLexiconForm(lang, target, newForm, {
    bornGeneration: 0,
    origin: donor ? `taboo:${donor}` : "taboo:self",
  });
  satSet(lang, "wordOrigin", target, donor ? `taboo:${donor}` : "taboo:self");
  satSet(lang, "wordFrequencyHints", target, 0.55);

  return {
    meaning: target,
    oldForm: oldFormStr,
    newForm: newForm.join(""),
    donor,
  };
}
