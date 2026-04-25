import type { Meaning } from "../types";
import { BASIC_240 } from "./basic240";
import { posOf, type POS } from "./pos";
import { clusterOf } from "../semantics/clusters";
import { frequencyFor } from "./frequency";
import { EXPANDED_CONCEPTS } from "./expanded_concepts";

/**
 * The concept registry: a language-agnostic inventory of meanings that
 * any language could, in principle, lexicalise. Every entry is tagged
 * with:
 *
 *  - `pos`:        which part-of-speech this concept prototypically fills.
 *  - `cluster`:    the broad semantic domain ("body", "kinship", "tools"…).
 *  - `tier`:       the earliest cultural stage at which a language could
 *                  plausibly name this concept (see `Tier` below). A
 *                  stone-age language won't get "wheel" or "iron" until
 *                  its cultural tier advances past foraging.
 *  - `frequencyClass`: rough corpus frequency — basic terms drift faster,
 *                      specialised terms last longer.
 *  - `colexWith`:  concepts that some languages fold into the same slot
 *                  (Russian `ruka` = arm+hand; English `tongue` = tongue
 *                  + language). Used by the re-carving event to decide
 *                  which pairs can merge or split.
 *
 * The registry is **language-independent**: identifying a concept with
 * id `"water"` does NOT mean every language carves meaning-space the
 * same way. Re-carving events (see `semantics/recarve.ts`) let
 * daughter languages merge or split concept slots so the family ends
 * up with genuinely divergent semantic maps.
 */

export type Tier = 0 | 1 | 2 | 3;

/**
 * Cultural tier semantics, in ascending order of technological depth:
 *   0  — foraging / palaeolithic. Body, kinship, wild flora + fauna,
 *        weather, stars, body-action verbs, number-up-to-10.
 *   1  — agricultural / neolithic. Domestic animals, crops, processed
 *        food, pottery, weaving, village-scale social roles.
 *   2  — iron-age / classical. Metals, law, writing, long-distance
 *        trade, city-state social organisation.
 *   3  — modern. Industrial, medical, and technological vocabulary.
 *        Reserved for later content — the sim doesn't currently
 *        advance tiers fast enough to reach it, but the slot is
 *        here so future concept additions have a home.
 */
export const TIER_LABELS: Record<Tier, string> = {
  0: "forager",
  1: "agricultural",
  2: "iron-age",
  3: "modern",
};

export type FrequencyClass = "basic" | "common" | "specialised" | "rare";

export interface Concept {
  id: Meaning;
  pos: POS;
  cluster: string;
  tier: Tier;
  frequencyClass: FrequencyClass;
  /** Concepts cross-linguistically folded into the same lexical slot. */
  colexWith?: readonly Meaning[];
}

/**
 * Overrides — concepts that should live above tier 0. Everything not
 * listed here defaults to tier 0 (universal palaeolithic).
 *
 * Sources: known cross-linguistic culture-level correlations.
 * Agricultural items: Harris 1977, Diamond 1997; iron-age items:
 * Anthony 2007, Kroll 2009.
 */
const TIER_OVERRIDES: Partial<Record<Meaning, Tier>> = {
  // --- Tier 1: agricultural / neolithic ---
  // Domestic animals (post-domestication, 10-6 kya)
  cow: 1, ox: 1, sheep: 1, goat: 1, chicken: 1, duck: 1, pig: 1,
  mare: 1, foal: 1, stallion: 1, bull: 1, ram: 1, "calf-animal": 1,
  goose: 1, horse: 1,
  // Cultivated plants
  wheat: 1, barley: 1, rice: 1, bean: 1, pea: 1, onion: 1, garlic: 1,
  cabbage: 1, apple: 1, pear: 1, cherry: 1, plum: 1, grape: 1, fig: 1,
  olive: 1, bamboo: 1, grain: 1,
  // Processed food + drink
  bread: 1, meat: 1, milk: 1, cheese: 1, butter: 1, honey: 1, soup: 1,
  porridge: 1, cake: 1, beer: 1, wine: 1, oil: 1, broth: 1, stew: 1,
  spice: 1, flour: 1, dough: 1, egg: 1,
  // Clothing / textiles
  cloth: 1, shirt: 1, belt: 1, shoe: 1, hat: 1, coat: 1, robe: 1,
  sandal: 1, glove: 1, ring: 1, necklace: 1, bracelet: 1,
  // Agricultural tools + containers
  hammer: 1, needle: 1, thread: 1, pot: 1, cup: 1, bowl: 1, spoon: 1,
  plate: 1, boat: 1, cart: 1, saddle: 1, bridle: 1, plow: 1, sickle: 1,
  loom: 1, lamp: 1, box: 1,
  // Village-scale social + ritual
  village: 1, town: 1, king: 1, servant: 1, priest: 1, warrior: 1,
  temple: 1, tomb: 1, grave: 1, marriage: 1, funeral: 1, feast: 1,
  sacrifice: 1, ritual: 1, oath: 1,
  // Agricultural-era actions
  plant: 1, harvest: 1, cook: 1, wash: 1, wear: 1, tie: 1, build: 1,
  buy: 1, sell: 1, pay: 1, owe: 1, count: 1, measure: 1,
  // Domestic-animal-adjacent
  ride: 1, sail: 1,
  // Numbers above ten
  hundred: 1, thousand: 1,

  // --- Tier 2: iron-age / classical ---
  // Metals (post-smelting, 3-1 kya depending on region)
  metal: 2, gold: 2, silver: 2, iron: 2, copper: 2, tin: 2, coal: 2,
  anvil: 2, sword: 2,
  // Literacy + organised state
  law: 2, justice: 2, mercy: 2, debt: 2, slave: 2, lord: 2, hero: 2,
  write: 2, read: 2, teach: 2, learn: 2,
  tradition: 2, wisdom: 2, folly: 2, virtue: 2, sin: 2,
  // Long-distance trade
  trade: 2, craft: 2, skill: 2, sugar: 2,

  // --- Tier 3: modern ---
  // (Deliberately empty for now — BASIC_240 doesn't include industrial-era
  // vocabulary. Reserved so future concept additions have a home.)
};

/**
 * Cross-linguistic colexification hints: pairs of concepts that a
 * non-trivial number of languages fold into one lexical slot. Used by
 * `semantics/recarve.ts` to bias which concepts can merge into a
 * polysemous superslot or split apart.
 *
 * Sources: CLICS³ colexification database, sampled for the most
 * typologically recurrent pairs.
 */
const COLEX_PAIRS: ReadonlyArray<readonly [Meaning, Meaning]> = [
  // Body — high-frequency colexifications
  ["arm", "hand"],          // Russian ruka, Macedonian raka
  ["leg", "foot"],          // Hebrew regel, many Semitic
  ["finger", "toe"],        // many Oceanic
  ["eye", "face"],          // Austronesian scattered
  ["mouth", "lip"],         // several Amerindian
  ["hair", "fur"],          // most IE collapsed these later
  ["skin", "bark"],         // many (e.g. Ewe ŋutigbalẽ)
  ["tongue", "word"],       // IE *dn̥ǵʰwéh₂s
  ["heart", "soul"],        // many IE: cor / Herz / heart
  ["flesh", "meat"],        // common; English historically fused these
  ["blood", "kin"],         // English "blood relation", many others
  ["bone", "seed"],         // Bantu and some Austronesian
  ["belly", "womb"],        // Greek γαστήρ
  ["breast", "milk"],       // many African

  // Environment
  ["sun", "day"],           // Romance día / dies
  ["moon", "month"],        // Latin mensis / luna collapse in some families
  ["star", "spark"],        // some Amerindian
  ["water", "river"],       // many
  ["fire", "wood"],         // some Austronesian
  ["tree", "wood"],         // English, German Baum/Holz merge in older forms
  ["stone", "mountain"],    // some Turkic
  ["earth", "ground"],      // very common
  ["sky", "heaven"],        // many IE
  ["sky", "god"],           // Proto-IE *dyēus
  ["cloud", "sky"],         // some languages
  ["rain", "water"],        // some Austronesian
  ["smoke", "fog"],         // several
  ["sand", "dust"],         // Arabic-area
  ["night", "dark"],        // many
  ["morning", "dawn"],      // almost universal

  // Perception / cognition
  ["see", "know"],          // English "see" = understand; Latin video / vidi
  ["hear", "understand"],   // Spanish entender etymology
  ["say", "speak"],         // English collapse, many others
  ["know", "understand"],   // Romance saber / savoir
  ["forget", "lose"],       // Hungarian elveszít/elfelejt root family
  ["think", "believe"],     // Greek νομίζω
  ["feel", "touch"],        // English collapse

  // Motion
  ["go", "walk"],           // most SVO languages
  ["come", "arrive"],       // Romance venir
  ["fall", "die"],          // several Amerindian
  ["swim", "float"],        // Germanic
  ["climb", "rise"],        // Slavic
  ["chase", "hunt"],        // many

  // Metabolism
  ["eat", "chew"],          // English collapse
  ["eat", "drink"],         // Pama-Nyungan
  ["sleep", "lie"],         // English collapse
  ["die", "sleep"],         // euphemism, widespread
  ["breathe", "rest"],      // several

  // Kinship
  ["mother", "aunt"],       // many Iroquoian
  ["father", "uncle"],      // many Iroquoian
  ["brother", "cousin"],    // many Hawaiian-style kinship
  ["sister", "cousin"],     // many Hawaiian
  ["child", "son"],         // some languages default male-gendered
  ["child", "baby"],        // very common
  ["friend", "neighbor"],   // several
  ["enemy", "stranger"],    // several

  // Quality
  ["good", "nice"],         // English collapse
  ["bad", "ugly"],          // some IE
  ["big", "tall"],          // Japanese ookii
  ["small", "short"],       // Japanese chiisai
  ["hot", "warm"],          // some languages
  ["cold", "cool"],         // some languages
  ["new", "young"],         // Germanic etymology
  ["old", "ancient"],       // many

  // Abstract
  ["name", "word"],         // several
  ["word", "language"],     // English collapse, Greek logos
  ["song", "music"],        // many
  ["story", "myth"],        // Greek mythos/logos
  ["dream", "vision"],      // many
  ["spirit", "ghost"],      // English collapse; Latin spiritus
  ["spirit", "breath"],     // Latin anima, Greek pneuma
  ["fear", "respect"],      // Hebrew yareh, Greek phobos
  ["love", "like"],         // German mögen/lieben collapse
  ["peace", "calm"],        // many
  ["war", "fight"],         // many
];

/** Cluster name for any Basic concept. Falls back to "other" for strays. */
function inferCluster(id: Meaning): string {
  return clusterOf(id) ?? "other";
}

/** Assign a FrequencyClass from the hand-tuned numeric hints in frequency.ts. */
function inferFrequencyClass(id: Meaning): FrequencyClass {
  const f = frequencyFor(id);
  if (f >= 0.85) return "basic";
  if (f >= 0.65) return "common";
  if (f >= 0.45) return "specialised";
  return "rare";
}

function buildRegistry(): Record<Meaning, Concept> {
  const out: Record<Meaning, Concept> = {};
  // Build an index of colex neighbors per concept.
  const colexOf: Record<Meaning, Set<Meaning>> = {};
  for (const [a, b] of COLEX_PAIRS) {
    (colexOf[a] ??= new Set()).add(b);
    (colexOf[b] ??= new Set()).add(a);
  }
  for (const id of BASIC_240) {
    const tier = TIER_OVERRIDES[id] ?? 0;
    const cluster = inferCluster(id);
    const pos = posOf(id);
    const frequencyClass = inferFrequencyClass(id);
    const nbr = colexOf[id];
    out[id] = {
      id,
      pos,
      cluster,
      tier,
      frequencyClass,
      colexWith: nbr ? Array.from(nbr).sort() : undefined,
    };
  }
  // Layer the expanded concepts on top. Anything already in the
  // BASIC_240 set wins (we don't want a tier-3 expansion to override
  // a tier-0 basic word). Expanded concepts ship with explicit tier
  // + cluster + POS so we don't consult `clusterOf` / `posOf` for them.
  for (const exp of EXPANDED_CONCEPTS) {
    if (out[exp.id]) continue;
    const nbr = colexOf[exp.id];
    out[exp.id] = {
      id: exp.id,
      pos: exp.pos,
      cluster: exp.cluster,
      tier: exp.tier,
      frequencyClass: inferFrequencyClass(exp.id),
      colexWith: nbr ? Array.from(nbr).sort() : undefined,
    };
  }
  return out;
}

export const CONCEPTS: Readonly<Record<Meaning, Concept>> = Object.freeze(buildRegistry());

/** Ordered list of all concept ids in the registry. */
export const CONCEPT_IDS: readonly Meaning[] = Object.freeze(
  Object.keys(CONCEPTS).sort(),
);

/** Look up a concept's full metadata. Returns undefined for language-
 *  private meanings (compounds, derived forms) that aren't in the
 *  universal registry. */
export function conceptFor(id: Meaning): Concept | undefined {
  return CONCEPTS[id];
}

/** Tier of a concept; tier 0 for meanings not in the registry so that
 *  callers can still compare without a null-check. */
export function tierOf(id: Meaning): Tier {
  return CONCEPTS[id]?.tier ?? 0;
}

/** Cross-linguistic colexification hints for a given concept. */
export function colexWith(id: Meaning): readonly Meaning[] {
  return CONCEPTS[id]?.colexWith ?? [];
}

/** Every concept at or below the given cultural tier. Used by the
 *  dictionary-pull genesis path — a tier-0 language can't coin "iron". */
export function conceptsAtOrBelow(tier: Tier): readonly Meaning[] {
  return CONCEPT_IDS.filter((id) => CONCEPTS[id]!.tier <= tier);
}

/** True if the concept is in the registry (as opposed to a language-
 *  private compound meaning like "water-er" or "dark-night"). */
export function isRegisteredConcept(id: Meaning): boolean {
  return id in CONCEPTS;
}
