import type { Meaning } from "../types";
import { BASIC_240, CLUSTERS as BASIC_CLUSTERS } from "./basic240";
import { posOf, type POS } from "./pos";
import { frequencyFor } from "./frequency";
import { EXPANDED_CONCEPTS } from "./expanded_concepts";

export type Tier = 0 | 1 | 2 | 3;

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
  // Phase 47 T6: word-dynamism metadata.
  /**
   * Default primitive parts for cross-linguistic decomposition. When
   * a language doesn't have this meaning in its lexicon, the synthesis
   * path can compose it from these parts (provided each part is in
   * the language's lexicon). Distinct from per-language seedCompounds
   * which are language-specific stable compositions; this is the
   * cross-linguistic default fallback.
   */
  decomposition?: readonly Meaning[];
  /**
   * Explicit primitive marker. True for concepts that should never
   * be decomposed even if they have a `decomposition` (e.g., NSM-style
   * core primes: I, YOU, KNOW, GOOD, BIG). False/undefined for
   * concepts that can be decomposed.
   */
  primitive?: boolean;
  /**
   * When true, the genesis pipeline may coin this meaning without
   * recording an etymology — i.e., produce a phoneme sequence from
   * the language's inventory and skip the wordOriginChain entry.
   * Models concepts like English "dog" / "boy" / "girl" whose
   * etymologies are disputed or lost.
   */
  canBeOpaqueCoined?: boolean;
}

const TIER_OVERRIDES: Partial<Record<Meaning, Tier>> = {
  cow: 1, ox: 1, sheep: 1, goat: 1, chicken: 1, duck: 1, pig: 1,
  mare: 1, foal: 1, stallion: 1, bull: 1, ram: 1, "calf-animal": 1,
  goose: 1, horse: 1,
  wheat: 1, barley: 1, rice: 1, bean: 1, pea: 1, onion: 1, garlic: 1,
  cabbage: 1, apple: 1, pear: 1, cherry: 1, plum: 1, grape: 1, fig: 1,
  olive: 1, bamboo: 1, grain: 1,
  bread: 1, meat: 1, milk: 1, cheese: 1, butter: 1, honey: 1, soup: 1,
  porridge: 1, cake: 1, beer: 1, wine: 1, oil: 1, broth: 1, stew: 1,
  spice: 1, flour: 1, dough: 1, egg: 1,
  cloth: 1, shirt: 1, belt: 1, shoe: 1, hat: 1, coat: 1, robe: 1,
  sandal: 1, glove: 1, ring: 1, necklace: 1, bracelet: 1,
  hammer: 1, needle: 1, thread: 1, pot: 1, cup: 1, bowl: 1, spoon: 1,
  plate: 1, boat: 1, cart: 1, saddle: 1, bridle: 1, plow: 1, sickle: 1,
  loom: 1, lamp: 1, box: 1,
  village: 1, town: 1, king: 1, servant: 1, priest: 1, warrior: 1,
  temple: 1, tomb: 1, grave: 1, marriage: 1, funeral: 1, feast: 1,
  sacrifice: 1, ritual: 1, oath: 1,
  plant: 1, harvest: 1, cook: 1, wash: 1, wear: 1, tie: 1, build: 1,
  buy: 1, sell: 1, pay: 1, owe: 1, count: 1, measure: 1,
  ride: 1, sail: 1,
  hundred: 1, thousand: 1,

  metal: 2, gold: 2, silver: 2, iron: 2, copper: 2, tin: 2, coal: 2,
  anvil: 2, sword: 2,
  law: 2, justice: 2, mercy: 2, debt: 2, slave: 2, lord: 2, hero: 2,
  write: 2, read: 2, teach: 2, learn: 2,
  tradition: 2, wisdom: 2, folly: 2, virtue: 2, sin: 2,
  trade: 2, craft: 2, skill: 2, sugar: 2,

};

const COLEX_PAIRS: ReadonlyArray<readonly [Meaning, Meaning]> = [
  ["arm", "hand"],
  ["leg", "foot"],
  ["finger", "toe"],
  ["eye", "face"],
  ["mouth", "lip"],
  ["hair", "fur"],
  ["skin", "bark"],
  ["tongue", "word"],
  ["heart", "soul"],
  ["flesh", "meat"],
  ["blood", "kin"],
  ["bone", "seed"],
  ["belly", "womb"],
  ["breast", "milk"],

  ["sun", "day"],
  ["moon", "month"],
  ["star", "spark"],
  ["water", "river"],
  ["fire", "wood"],
  ["tree", "wood"],
  ["stone", "mountain"],
  ["earth", "ground"],
  ["sky", "heaven"],
  ["sky", "god"],
  ["cloud", "sky"],
  ["rain", "water"],
  ["smoke", "fog"],
  ["sand", "dust"],
  ["night", "dark"],
  ["morning", "dawn"],

  ["see", "know"],
  ["hear", "understand"],
  ["say", "speak"],
  ["know", "understand"],
  ["forget", "lose"],
  ["think", "believe"],
  ["feel", "touch"],

  ["go", "walk"],
  ["come", "arrive"],
  ["fall", "die"],
  ["swim", "float"],
  ["climb", "rise"],
  ["chase", "hunt"],

  ["eat", "chew"],
  ["eat", "drink"],
  ["sleep", "lie"],
  ["die", "sleep"],
  ["breathe", "rest"],

  ["mother", "aunt"],
  ["father", "uncle"],
  ["brother", "cousin"],
  ["sister", "cousin"],
  ["child", "son"],
  ["child", "baby"],
  ["friend", "neighbor"],
  ["enemy", "stranger"],

  ["good", "nice"],
  ["bad", "ugly"],
  ["big", "tall"],
  ["small", "short"],
  ["hot", "warm"],
  ["cold", "cool"],
  ["new", "young"],
  ["old", "ancient"],

  ["name", "word"],
  ["word", "language"],
  ["song", "music"],
  ["story", "myth"],
  ["dream", "vision"],
  ["spirit", "ghost"],
  ["spirit", "breath"],
  ["fear", "respect"],
  ["love", "like"],
  ["peace", "calm"],
  ["war", "fight"],
];

const BASIC_CLUSTER_OF: Record<Meaning, string> = (() => {
  const out: Record<Meaning, string> = {};
  for (const [name, members] of Object.entries(BASIC_CLUSTERS)) {
    for (const m of members) out[m] = name;
  }
  return out;
})();

/**
 * Phase 47 T6: cross-linguistic primitives (NSM-style core inventory).
 * Concepts marked `primitive: true` are conceptually irreducible —
 * the synthesis path will never try to decompose them even if they
 * have a `decomposition` field. Inspired by Wierzbicka & Goddard's
 * ~65 universal semantic primes; trimmed to a tractable starter set.
 */
const PRIMITIVE_MEANINGS: ReadonlySet<Meaning> = new Set([
  // Substantives
  "i", "you", "he", "she", "we", "they", "it", "child", "person",
  // Determiners + quantifiers
  "this", "that", "all", "many", "one", "two", "some",
  // Mental predicates
  "think", "know", "feel", "want", "see", "hear",
  // Action / motion / contact
  "do", "make", "go", "come", "give", "take", "say",
  // Existence / possession
  "be", "have", "live", "die",
  // Time
  "now", "before", "after", "day", "night",
  // Space
  "here", "there", "above", "below", "in", "on", "near", "far",
  // Evaluators
  "good", "bad", "big", "small",
  // Descriptors
  "hot", "cold", "new", "old",
  // Body atoms
  "body", "head", "hand", "eye", "mouth",
  // Natural atoms
  "water", "fire", "earth", "sky", "stone",
]);

/**
 * Phase 47 T6: sample cross-linguistic decompositions. When a
 * language's lexicon doesn't have the meaning AND morphological
 * synthesis returned null, the synthesis path attempts to compose
 * from these parts (provided each part is in the language's lexicon).
 * Distinct from per-language seedCompounds (T5) which override these
 * defaults.
 *
 * This is a STARTER set demonstrating the pattern. The plan's full
 * ~2000-concept expansion (T7-T8) would land here in batches.
 */
const DEFAULT_DECOMPOSITIONS: Readonly<Record<Meaning, readonly Meaning[]>> = {
  // Tools as compositions
  computer: ["work", "know"],
  phone: ["far", "speak"],
  school: ["home", "know"],
  hospital: ["home", "doctor"],
  library: ["home", "book"],
  // Places
  city: ["big", "village"],
  factory: ["big", "work"],
  // Roles
  teacher: ["person", "know"],
  student: ["person", "learn"],
  doctor: ["person", "medicine"],
  // Time
  morning: ["new", "day"],
  evening: ["old", "day"],
  // Concepts
  language: ["all", "word"],
  story: ["many", "word"],

  // Phase 47 T7: expanded decompositions for the new concepts.
  // Body subdivisions (composed from primitive body atoms + descriptors)
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
  // Kinship subdivisions
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
  // Animals via composition
  hare: ["small", "rabbit"],
  rooster: ["man", "bird"],
  hen: ["woman", "bird"],
  chick: ["child", "bird"],
  calf: ["child", "cow"],
  piglet: ["child", "pig"],
  lamb: ["child", "sheep"],
  puppy: ["child", "dog"],
  kitten: ["child", "cat"],
  // Plants
  acorn: ["seed", "tree"],
  pinecone: ["seed", "pine"],
  seedling: ["new", "plant"],
  sapling: ["small", "tree"],
  twig: ["small", "branch"],
  blossom: ["new", "flower"],
  petal: ["flower", "leaf"],
  // Food via composition
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
  // Time via composition
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
  // Weather via composition
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
  // Sensory + emotion
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

  // Phase 47 T8: decompositions for the trade/government/war/etc batch.
  // Architecture
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
  // Clothing
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
  // Music / art
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
  // Travel
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
  // Trade / economics
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
  // Government / law
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
  // War / military
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
  // Knowledge / science
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
 * Phase 47 T6: meanings that may be coined without recoverable
 * etymology. Models the linguistic reality that not every word has
 * an attestable origin (English "dog", "boy", "girl"). The genesis
 * pipeline's coinage path may skip the wordOriginChain entry for
 * meanings flagged here.
 */
const OPAQUE_COINAGE_ELIGIBLE: ReadonlySet<Meaning> = new Set([
  "dog", "boy", "girl", "child", "wolf", "fox", "bear", "rabbit",
  "fish", "bird", "tree", "stone", "river", "mountain",
  // Phase 47 T7 additions: more etymologically-opaque-cross-linguistic
  // animals + plants + body atoms
  "hare", "squirrel", "badger", "otter", "beaver", "monkey", "rat",
  "tiger", "lion", "leopard", "crocodile", "turtle", "frog",
  "salmon", "shark", "whale", "crab", "snail", "butterfly", "moth",
  "owl", "raven", "sparrow", "dove",
  "willow", "birch", "maple", "cedar", "fern", "moss",
]);

function inferCluster(id: Meaning): string {
  return BASIC_CLUSTER_OF[id] ?? "other";
}

function inferFrequencyClass(id: Meaning): FrequencyClass {
  const f = frequencyFor(id);
  if (f >= 0.85) return "basic";
  if (f >= 0.65) return "common";
  if (f >= 0.45) return "specialised";
  return "rare";
}

function buildRegistry(): Record<Meaning, Concept> {
  const out: Record<Meaning, Concept> = {};
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
      // Phase 47 T6: cross-linguistic decomposition metadata.
      decomposition: DEFAULT_DECOMPOSITIONS[id],
      primitive: PRIMITIVE_MEANINGS.has(id) ? true : undefined,
      canBeOpaqueCoined: OPAQUE_COINAGE_ELIGIBLE.has(id) ? true : undefined,
    };
  }
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
      decomposition: DEFAULT_DECOMPOSITIONS[exp.id],
      primitive: PRIMITIVE_MEANINGS.has(exp.id) ? true : undefined,
      canBeOpaqueCoined: OPAQUE_COINAGE_ELIGIBLE.has(exp.id) ? true : undefined,
    };
  }
  return out;
}

export const CONCEPTS: Readonly<Record<Meaning, Concept>> = Object.freeze(buildRegistry());

export const CONCEPT_IDS: readonly Meaning[] = Object.freeze(
  Object.keys(CONCEPTS).sort(),
);

export function conceptFor(id: Meaning): Concept | undefined {
  return CONCEPTS[id];
}

export function tierOf(id: Meaning): Tier {
  return CONCEPTS[id]?.tier ?? 0;
}

export function colexWith(id: Meaning): readonly Meaning[] {
  return CONCEPTS[id]?.colexWith ?? [];
}

export function conceptsAtOrBelow(tier: Tier): readonly Meaning[] {
  return CONCEPT_IDS.filter((id) => CONCEPTS[id]!.tier <= tier);
}

export function isRegisteredConcept(id: Meaning): boolean {
  return id in CONCEPTS;
}
