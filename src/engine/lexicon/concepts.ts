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
