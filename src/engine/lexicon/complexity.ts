import type { Meaning } from "../types";

/**
 * Rough semantic complexity / abstractness on a 1..5 scale.
 *  1 — concrete body part, pronoun, primary colour, count-word.
 *  2 — everyday physical object or basic action.
 *  3 — broader ordinary noun/verb (weather, kin beyond immediate).
 *  4 — evaluative adjective, relational concept.
 *  5 — highly abstract (truth, memory, idea).
 *
 * Used to bias genesis (longer forms for abstract meanings) and obsolescence
 * (abstract words resist retirement because they have less casual pressure).
 */
export const COMPLEXITY: Record<Meaning, number> = {
  // --- body parts (mostly 1) ----------------------------------------------
  hand: 1, foot: 1, heart: 1, head: 1, eye: 1, ear: 1, mouth: 1,
  tooth: 1, bone: 1, blood: 1, hair: 1, skin: 1, finger: 1, knee: 1,
  elbow: 1, shoulder: 1, neck: 1, back: 1, belly: 1, liver: 2,
  lung: 2, arm: 1, leg: 1, nose: 1, tongue: 1, chin: 1, cheek: 1,
  nail: 1, breast: 1, throat: 1,

  // --- kinship (1-3) ------------------------------------------------------
  mother: 1, father: 1, son: 1, daughter: 1, brother: 1, sister: 1,
  uncle: 2, aunt: 2, grandparent: 3, child: 1, parent: 2, husband: 2,
  wife: 2, friend: 2, cousin: 3,

  // --- environment (2-3) --------------------------------------------------
  water: 2, fire: 2, stone: 2, tree: 2, sun: 2, moon: 2, star: 2,
  night: 2, day: 2, sky: 2, cloud: 2, rain: 2, snow: 2, wind: 2,
  sea: 2, river: 2, mountain: 2, hill: 2, forest: 2, cave: 2,
  earth: 2, grass: 2, ice: 2, smoke: 3, dust: 3, shadow: 3,
  light: 2, thunder: 3, sand: 2, mud: 2, salt: 2, metal: 3,
  wood: 2, leaf: 2, root: 2, stream: 2, swamp: 3, island: 3,
  valley: 3, lake: 2, coast: 3, shore: 2, horizon: 4, field: 2,
  path: 2,

  // --- animals (2) --------------------------------------------------------
  dog: 2, wolf: 2, horse: 2, cow: 2, fish: 2, bird: 2, snake: 2,
  cat: 2, bear: 2, deer: 2, rabbit: 2, mouse: 2, fox: 2, boar: 2,
  ox: 2, sheep: 2, goat: 2, chicken: 2, duck: 2, eagle: 2, hawk: 2,
  pig: 2, lion: 2, tiger: 2, frog: 2, lizard: 2, bee: 2, ant: 2,
  spider: 2, worm: 2, fly: 2, mosquito: 2, turtle: 2, whale: 3,
  shark: 3,

  // --- plants (2) ---------------------------------------------------------
  flower: 2, seed: 2, berry: 2, apple: 2, oak: 2, pine: 2, bush: 2,
  moss: 2, vine: 2, herb: 2, mushroom: 2, reed: 2, grain: 2,
  fruit: 2, nut: 2,

  // --- actions ------------------------------------------------------------
  go: 2, come: 2, walk: 2, run: 2, swim: 2, climb: 2,
  fall: 2, rise: 2, see: 2, know: 3, hear: 2, feel: 3, eat: 2,
  drink: 2, sleep: 2, die: 2, breathe: 2, sit: 2, stand: 2,
  stay: 2, give: 2, take: 2, throw: 2, break: 2, cut: 2, kill: 2,
  sing: 2, speak: 2, fight: 2, hunt: 2, gather: 2, plant: 2,
  harvest: 3, cook: 2, wash: 2, wear: 2, tie: 2, push: 2, pull: 2,
  carry: 2, build: 2, dig: 2, drop: 2, hold: 2, work: 2,

  // --- qualities (3-4) ----------------------------------------------------
  big: 3, small: 3, new: 3, old: 3, good: 3, bad: 3, hot: 3, cold: 3,
  wet: 3, dry: 3, long: 3, short: 3, hard: 3, soft: 3, heavy: 3,
  round: 3, sharp: 3, sweet: 3, sour: 3, strong: 3, weak: 3,
  fast: 3, slow: 3, deep: 3,

  // --- pronouns (1) -------------------------------------------------------
  i: 1, you: 1, they: 1, we: 1, "he-she": 1, this: 1, that: 1,
  here: 1, there: 1, what: 2, who: 2, where: 2, when: 2, why: 3,
  how: 3,

  // --- numbers ------------------------------------------------------------
  one: 1, two: 1, three: 1, four: 2, five: 2, six: 2, seven: 2,
  eight: 2, nine: 2, ten: 2, hundred: 3, thousand: 3, many: 3,
  few: 3, half: 3,

  // --- abstract (4-5) -----------------------------------------------------
  name: 3, word: 3, song: 3, story: 4, year: 3, love: 4, fear: 3,
  hope: 5, peace: 4, war: 3, dream: 4, spirit: 5, god: 4, law: 4,
  gift: 3, trade: 4, home: 3, road: 3, village: 3, town: 3,
  king: 3, servant: 4, free: 4, game: 3, joy: 4, grief: 4,
  truth: 5, honour: 5, meaning: 5,
  // "lie" (action) covered here; surface form "lie" (false statement) re-uses it.
  lie: 2,
};

export const DEFAULT_COMPLEXITY = 2;

export function complexityFor(meaning: Meaning): number {
  const direct = COMPLEXITY[meaning];
  if (direct !== undefined) return direct;
  // Compounds and derivations inherit the max of their parts + 1 (bounded).
  if (meaning.includes("-")) {
    const parts = meaning.split("-");
    let max = DEFAULT_COMPLEXITY;
    for (const p of parts) {
      const c = COMPLEXITY[p];
      if (c !== undefined && c > max) max = c;
    }
    return Math.min(5, max + 1);
  }
  if (/-(er|ness|ic|al|ine|intens)$/.test(meaning)) {
    const base = meaning.replace(/-(er|ness|ic|al|ine|intens)$/, "");
    const c = COMPLEXITY[base];
    if (c !== undefined) return Math.min(5, c + 1);
  }
  return DEFAULT_COMPLEXITY;
}
