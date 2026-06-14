import type { Meaning } from "../types";
import { type POS } from "./pos";
import {
  type Tier,
  posOf,
  tierOf,
  zipfFrequencyFor,
  conceptsAtOrBelow,
  isRegisteredConcept,
  CONCEPT_IDS,
} from "./conceptRegistry";
import { frequencyFor } from "./frequency";
import { clusterRegionOf } from "../semantics/anchorQueries";
import { geometricNeighbors } from "../semantics/neighbors";
import { lexPoint } from "../semantics/meaningPoint";

/**
 * concepts.ts — the FAÇADE over the geometry-native concept inventory (G1).
 *
 * The inventory + POS + tier + frequency are derived in conceptRegistry.ts (from the
 * baked embedding/corpus data); cluster + colexWith are GEOMETRIC (nearest-centroid /
 * nearest-neighbour over the GloVe points). This module composes them into the historic
 * `Concept` record and re-exports the registry interface UNCHANGED so the ~38 consumers
 * keep working. The retired hand data (basic240 list + expanded_concepts) is gone; the
 * curated SEMANTIC metadata below (decomposition / primitive / opaque-coinage) is NOT part
 * of the inventory and is retained — it is orthogonal linguistic knowledge keyed by meaning.
 */

export type { Tier };
export { posOf, tierOf, zipfFrequencyFor, conceptsAtOrBelow, isRegisteredConcept, CONCEPT_IDS };

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
  colexWith?: readonly Meaning[];
  /**
   * Default primitive parts for cross-linguistic decomposition. When a language
   * doesn't have this meaning in its lexicon, the synthesis path can compose it
   * from these parts (provided each part is in the language's lexicon).
   */
  decomposition?: readonly Meaning[];
  /** Explicit primitive marker — concepts that should never be decomposed (NSM core primes). */
  primitive?: boolean;
  /** When true, the genesis pipeline may coin this meaning without recording an etymology. */
  canBeOpaqueCoined?: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Retained curated SEMANTIC metadata (orthogonal to the inventory derivation).
// ──────────────────────────────────────────────────────────────────────────

/**
 * Cross-linguistic primitives (NSM-style core inventory). Concepts marked
 * primitive are conceptually irreducible — synthesis never decomposes them.
 */
const PRIMITIVE_MEANINGS: ReadonlySet<Meaning> = new Set([
  "i", "you", "he", "she", "we", "they", "it", "child", "person",
  "this", "that", "all", "many", "one", "two", "some",
  "think", "know", "feel", "want", "see", "hear",
  "do", "make", "go", "come", "give", "take", "say",
  "be", "have", "live", "die",
  "now", "before", "after", "day", "night",
  "here", "there", "above", "below", "in", "on", "near", "far",
  "good", "bad", "big", "small",
  "hot", "cold", "new", "old",
  "body", "head", "hand", "eye", "mouth",
  "water", "fire", "earth", "sky", "stone",
]);

/**
 * Sample cross-linguistic decompositions. When a language's lexicon doesn't have
 * the meaning AND morphological synthesis returned null, the synthesis path composes
 * from these parts (provided each part is in the language's lexicon).
 */
const DEFAULT_DECOMPOSITIONS: Readonly<Record<Meaning, readonly Meaning[]>> = {
  computer: ["work", "know"],
  phone: ["far", "speak"],
  school: ["home", "know"],
  hospital: ["home", "doctor"],
  library: ["home", "book"],
  city: ["big", "village"],
  factory: ["big", "work"],
  teacher: ["person", "know"],
  student: ["person", "learn"],
  doctor: ["person", "medicine"],
  morning: ["new", "day"],
  evening: ["old", "day"],
  language: ["all", "word"],
  story: ["many", "word"],
  forehead: ["head", "before"],
  eyebrow: ["eye", "hair"],
  eyelash: ["eye", "hair"],
  cheek: ["face", "side"],
  jaw: ["mouth", "bone"],
  throat: ["neck", "in"],
  ankle: ["foot", "head"],
  heel: ["foot", "back"],
  toe: ["foot", "child"],
  toenail: ["toe", "stone"],
  fingernail: ["finger", "stone"],
  knuckle: ["finger", "bone"],
  navel: ["body", "middle"],
  brain: ["head", "in"],
  skull: ["head", "bone"],
  grandmother: ["old", "mother"],
  grandfather: ["old", "father"],
  grandchild: ["child", "child"],
  granddaughter: ["child", "daughter"],
  grandson: ["child", "son"],
  nephew: ["brother", "son"],
  niece: ["brother", "daughter"],
  twin: ["two", "child"],
  stepmother: ["new", "mother"],
  stepfather: ["new", "father"],
  stepchild: ["new", "child"],
  hare: ["small", "rabbit"],
  rooster: ["man", "bird"],
  hen: ["woman", "bird"],
  chick: ["child", "bird"],
  calf: ["child", "cow"],
  piglet: ["child", "pig"],
  lamb: ["child", "sheep"],
  puppy: ["child", "dog"],
  kitten: ["child", "cat"],
  acorn: ["seed", "tree"],
  pinecone: ["seed", "pine"],
  seedling: ["new", "plant"],
  sapling: ["small", "tree"],
  twig: ["small", "branch"],
  blossom: ["new", "flower"],
  petal: ["flower", "leaf"],
  loaf: ["big", "bread"],
  crumb: ["small", "bread"],
  butter: ["fat", "milk"],
  yogurt: ["sour", "milk"],
  curd: ["hard", "milk"],
  pancake: ["flat", "bread"],
  noodle: ["long", "bread"],
  porridge: ["soft", "grain"],
  juice: ["water", "fruit"],
  lemonade: ["water", "lemon"],
  dawn: ["new", "day"],
  dusk: ["old", "day"],
  noon: ["middle", "day"],
  midnight: ["middle", "night"],
  sunrise: ["sun", "rise"],
  sunset: ["sun", "fall"],
  twilight: ["small", "light"],
  hour: ["small", "time"],
  minute: ["small", "hour"],
  decade: ["many", "year"],
  century: ["many", "year"],
  millennium: ["many", "year"],
  childhood: ["child", "time"],
  adulthood: ["man", "time"],
  hail: ["hard", "rain"],
  sleet: ["cold", "rain"],
  frost: ["cold", "water"],
  fog: ["water", "sky"],
  mist: ["small", "rain"],
  breeze: ["small", "wind"],
  gale: ["big", "wind"],
  hurricane: ["big", "storm"],
  flood: ["big", "water"],
  drought: ["dry", "long"],
  sight: ["see", "way"],
  hearing: ["hear", "way"],
  pain: ["bad", "feel"],
  pleasure: ["good", "feel"],
  warmth: ["hot", "feel"],
  chill: ["cold", "feel"],
  hunger: ["want", "eat"],
  thirst: ["want", "drink"],
  fatigue: ["want", "sleep"],
  joy: ["good", "feel"],
  sorrow: ["bad", "feel"],
  rage: ["big", "anger"],
  worry: ["bad", "think"],
  hope: ["good", "want"],
  loneliness: ["one", "feel"],
  doorway: ["door", "way"],
  threshold: ["door", "stone"],
  staircase: ["many", "step"],
  courtyard: ["middle", "house"],
  fortress: ["strong", "house"],
  citadel: ["strong", "house"],
  cottage: ["small", "house"],
  cabin: ["small", "house"],
  hut: ["small", "house"],
  barn: ["big", "house"],
  granary: ["house", "grain"],
  cellar: ["below", "house"],
  attic: ["above", "house"],
  workshop: ["work", "house"],
  cloak: ["big", "coat"],
  scarf: ["long", "cloth"],
  helmet: ["hard", "hat"],
  hood: ["hat", "back"],
  collar: ["cloth", "neck"],
  cuff: ["cloth", "hand"],
  sleeve: ["cloth", "arm"],
  trousers: ["cloth", "leg"],
  apron: ["cloth", "before"],
  boot: ["big", "shoe"],
  slipper: ["soft", "shoe"],
  mitten: ["cloth", "hand"],
  garment: ["all", "cloth"],
  melody: ["song", "way"],
  rhythm: ["time", "song"],
  hymn: ["god", "song"],
  lullaby: ["small", "song"],
  drum: ["wood", "skin"],
  bell: ["metal", "voice"],
  painting: ["color", "picture"],
  sculpture: ["stone", "shape"],
  statue: ["person", "stone"],
  portrait: ["person", "picture"],
  highway: ["big", "road"],
  crossroads: ["two", "road"],
  ferry: ["water", "boat"],
  harbor: ["safe", "water"],
  caravan: ["many", "wagon"],
  journey: ["long", "way"],
  voyage: ["water", "way"],
  pilgrimage: ["god", "way"],
  traveler: ["person", "go"],
  messenger: ["person", "say"],
  herald: ["person", "say"],
  oxcart: ["ox", "cart"],
  raft: ["wood", "boat"],
  sled: ["snow", "cart"],
  merchant: ["person", "trade"],
  trader: ["person", "trade"],
  buyer: ["person", "buy"],
  seller: ["person", "sell"],
  bargain: ["small", "price"],
  profit: ["good", "money"],
  debt: ["bad", "money"],
  loan: ["give", "money"],
  tax: ["take", "money"],
  tribute: ["give", "money"],
  toll: ["road", "money"],
  wage: ["work", "money"],
  salary: ["work", "money"],
  payment: ["give", "money"],
  treasure: ["many", "gold"],
  coin: ["small", "money"],
  inheritance: ["father", "money"],
  alms: ["good", "money"],
  emperor: ["big", "king"],
  empress: ["big", "queen"],
  prince: ["child", "king"],
  princess: ["child", "queen"],
  citizen: ["person", "city"],
  judge: ["person", "law"],
  guard: ["person", "watch"],
  watchman: ["person", "watch"],
  council: ["many", "person"],
  assembly: ["all", "person"],
  trial: ["law", "test"],
  verdict: ["law", "say"],
  decree: ["king", "say"],
  edict: ["king", "say"],
  treaty: ["two", "agree"],
  alliance: ["many", "friend"],
  pardon: ["good", "law"],
  punishment: ["bad", "law"],
  execution: ["kill", "law"],
  imprisonment: ["close", "person"],
  exile: ["away", "send"],
  army: ["many", "soldier"],
  legion: ["big", "army"],
  squad: ["small", "army"],
  soldier: ["person", "fight"],
  captain: ["head", "soldier"],
  general: ["big", "captain"],
  scout: ["person", "see"],
  spy: ["person", "watch"],
  prisoner: ["person", "close"],
  battle: ["big", "fight"],
  siege: ["close", "city"],
  ambush: ["hide", "fight"],
  surrender: ["stop", "fight"],
  victory: ["win", "fight"],
  defeat: ["lose", "fight"],
  conquest: ["take", "land"],
  invasion: ["enter", "land"],
  rebellion: ["fight", "ruler"],
  ignorance: ["not", "know"],
  proof: ["true", "show"],
  argument: ["two", "say"],
  reason: ["why", "think"],
  theory: ["think", "way"],
  invention: ["new", "make"],
  discovery: ["new", "find"],
  measurement: ["count", "size"],
  calculation: ["count", "think"],
};

/**
 * Meanings that may be coined without recoverable etymology (English "dog"/"boy"/"girl").
 * The genesis coinage path may skip the wordOriginChain entry for meanings flagged here.
 */
const OPAQUE_COINAGE_ELIGIBLE: ReadonlySet<Meaning> = new Set([
  "dog", "boy", "girl", "child", "wolf", "fox", "bear", "rabbit",
  "fish", "bird", "tree", "stone", "river", "mountain",
  "hare", "squirrel", "badger", "otter", "beaver", "monkey", "rat",
  "tiger", "lion", "leopard", "crocodile", "turtle", "frog",
  "salmon", "shark", "whale", "crab", "snail", "butterfly", "moth",
  "owl", "raven", "sparrow", "dove",
  "willow", "birch", "maple", "cedar", "fern", "moss",
]);

function inferFrequencyClass(id: Meaning): FrequencyClass {
  const f = frequencyFor(id);
  if (f >= 0.85) return "basic";
  if (f >= 0.65) return "common";
  if (f >= 0.45) return "specialised";
  return "rare";
}

function buildRegistry(): Record<Meaning, Concept> {
  const out: Record<Meaning, Concept> = {};
  for (const id of CONCEPT_IDS) {
    const nbr = geometricNeighbors(id, 3);
    out[id] = {
      id,
      pos: posOf(id),
      cluster: clusterRegionOf(lexPoint(id)),
      tier: tierOf(id),
      frequencyClass: inferFrequencyClass(id),
      colexWith: nbr.length > 0 ? Object.freeze([...nbr].sort()) : undefined,
      decomposition: DEFAULT_DECOMPOSITIONS[id],
      primitive: PRIMITIVE_MEANINGS.has(id) ? true : undefined,
      canBeOpaqueCoined: OPAQUE_COINAGE_ELIGIBLE.has(id) ? true : undefined,
    };
  }
  return out;
}

let _registry: Readonly<Record<Meaning, Concept>> | null = null;
function registry(): Readonly<Record<Meaning, Concept>> {
  return (_registry ??= Object.freeze(buildRegistry()));
}

/**
 * The concept registry. LAZY (Proxy): materialized on first access, not at module load, so the
 * geometric cluster/colex lookups in `buildRegistry` fire only after the anchor/centroid frame has
 * initialized — avoiding the eager-init cycle (concepts → anchorQueries → anchorLabeled → taboo →
 * clusters → … ). Supports the historic access patterns: `CONCEPTS[id]`, `id in CONCEPTS`,
 * `Object.keys/entries(CONCEPTS)`.
 */
export const CONCEPTS: Readonly<Record<Meaning, Concept>> = new Proxy(
  {} as Record<Meaning, Concept>,
  {
    get: (_t, p) => registry()[p as Meaning],
    has: (_t, p) => (p as Meaning) in registry(),
    ownKeys: () => Reflect.ownKeys(registry()),
    getOwnPropertyDescriptor: (_t, p) => {
      const d = Object.getOwnPropertyDescriptor(registry(), p);
      return d ? { ...d, configurable: true } : undefined;
    },
  },
) as Readonly<Record<Meaning, Concept>>;

export function conceptFor(id: Meaning): Concept | undefined {
  return registry()[id];
}

export function colexWith(id: Meaning): readonly Meaning[] {
  return CONCEPTS[id]?.colexWith ?? [];
}
