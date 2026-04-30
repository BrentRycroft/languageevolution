import type { Lexicon, Meaning, Phoneme, WordForm } from "../types";
import { fnv1a } from "../rng";

/**
 * Expanded basic vocabulary — ~500 meanings spanning body parts, kinship,
 * environment, animals, plants, actions, qualities, function words, numbers,
 * abstract concepts, crafts, tools, food, clothing, weather, social
 * relations, sensations and time. The original name BASIC_240 is kept for
 * back-compat even though the list is now ~500.
 *
 * Each preset provides hand-authored IPA for a "core" subset and uses
 * `fillMissing` for the rest, which generates phonotactically-plausible
 * forms from the preset's own inventory via a deterministic hash.
 */

export const CLUSTERS = {
  body: [
    "hand", "foot", "heart", "head", "eye", "ear", "mouth", "tooth",
    "bone", "blood", "hair", "skin", "finger", "knee", "elbow",
    "shoulder", "neck", "back", "belly", "liver", "lung", "arm",
    "leg", "nose", "tongue", "chin", "cheek", "nail", "breast", "throat",
    "forehead", "lip", "jaw", "chest", "rib", "spine", "hip", "thigh",
    "calf", "ankle", "wrist", "palm", "thumb", "toe", "eyebrow", "eyelash",
    "beard", "stomach", "navel", "gut", "flesh", "muscle", "fat", "sinew",
    "vein", "brain", "kidney", "bladder", "womb", "face",
  ],
  kinship: [
    "mother", "father", "son", "daughter", "brother", "sister", "uncle",
    "aunt", "grandparent", "child", "parent", "husband", "wife", "friend",
    "cousin", "grandfather", "grandmother", "grandson", "granddaughter",
    "nephew", "niece", "in-law", "widow", "orphan", "elder", "ancestor",
    "clan", "family", "tribe", "neighbor", "stranger",
  ],
  environment: [
    "water", "fire", "stone", "tree", "sun", "moon", "star", "night",
    "day", "sky", "cloud", "rain", "snow", "wind", "sea", "river",
    "mountain", "hill", "forest", "cave", "earth", "grass", "ice",
    "smoke", "dust", "shadow", "light", "thunder", "sand", "mud", "salt",
    "metal", "wood", "leaf", "root", "stream", "swamp", "island",
    "valley", "lake", "coast", "shore", "horizon", "field", "path",
    "frost", "dew", "fog", "mist", "storm", "lightning", "rainbow",
    "flood", "drought", "spring", "well", "pond", "meadow", "desert",
    "plain", "ridge", "cliff", "bay", "harbor", "dawn", "dusk", "noon",
    "midnight", "ground", "soil", "clay", "ash", "coal", "gold", "silver",
    "iron", "copper", "tin", "ember",
  ],
  animals: [
    "dog", "wolf", "horse", "cow", "fish", "bird", "snake", "cat", "bear",
    "deer", "rabbit", "mouse", "fox", "boar", "ox", "sheep", "goat",
    "chicken", "duck", "eagle", "hawk", "pig", "lion", "tiger", "frog",
    "lizard", "bee", "ant", "spider", "worm", "fly", "mosquito", "turtle",
    "whale", "shark", "elk", "stag", "lamb", "calf-animal", "mare", "foal",
    "stallion", "bull", "ram", "goose", "swan", "owl", "raven", "crow",
    "sparrow", "dove", "vulture", "salmon", "trout", "eel", "crab",
    "seal", "dolphin", "louse", "flea", "butterfly", "moth", "beetle",
    "scorpion", "bat", "squirrel", "badger",
  ],
  plants: [
    "flower", "seed", "berry", "apple", "oak", "pine", "bush", "moss",
    "vine", "herb", "mushroom", "reed", "grain", "fruit", "nut",
    "wheat", "barley", "rice", "bean", "pea", "onion", "garlic", "cabbage",
    "olive", "fig", "grape", "pear", "cherry", "plum", "birch", "willow",
    "elm", "beech", "maple", "palm", "fern", "thistle", "thorn", "branch",
    "bark", "bud", "blossom", "straw", "hay", "bamboo",
  ],
  food: [
    "bread", "meat", "milk", "cheese", "butter", "honey", "egg", "soup",
    "porridge", "cake", "beer", "wine", "oil", "broth", "stew", "spice",
    "sugar", "flour", "dough",
  ],
  clothing: [
    "cloth", "shirt", "belt", "shoe", "hat", "coat", "robe", "ring",
    "necklace", "glove", "bracelet", "sandal",
  ],
  tools: [
    "knife", "axe", "spear", "bow", "arrow", "sword", "hammer", "needle",
    "thread", "rope", "pot", "cup", "bowl", "spoon", "plate", "wheel",
    "boat", "ship", "cart", "saddle", "bridle", "net", "trap", "plow",
    "sickle", "loom", "anvil", "shield", "basket", "bag", "box", "lamp",
    "torch",
  ],
  motion: ["go", "come", "walk", "run", "fly", "swim", "climb", "fall", "rise",
    "jump", "crawl", "flow", "drift", "chase", "flee", "arrive", "depart",
    "turn", "follow", "lead", "wander", "march", "sail", "ride",
  ],
  perception: [
    "see", "know", "hear", "feel", "smell", "taste", "touch", "forget",
    "remember", "think", "dream-verb", "believe", "doubt", "notice",
  ],
  metabolism: [
    "eat", "drink", "sleep", "die", "breathe", "bite", "chew", "swallow",
    "bleed", "sweat", "suckle", "vomit", "grow", "age", "heal", "rot",
  ],
  action: [
    "sit", "stand", "lie", "stay", "give", "take", "throw", "break",
    "cut", "kill", "sing", "speak", "fight", "hunt", "gather", "plant",
    "harvest", "cook", "wash", "wear", "tie", "push", "pull", "carry",
    "build", "dig", "drop", "hold", "work", "steal", "rob", "hide",
    "find", "lose", "buy", "sell", "pay", "owe", "count", "measure",
    "write", "read", "teach", "learn", "dance", "play", "wait", "help",
    "warn", "swear", "pray", "laugh", "cry", "smile", "mock", "praise",
    "bless", "curse", "greet", "ask", "answer", "call", "whisper", "shout",
    "listen", "plan", "choose", "test",
  ],
  quality: [
    "big", "small", "new", "old", "good", "bad", "hot", "cold", "wet",
    "dry", "long", "short", "hard", "soft", "heavy", "light", "round",
    "sharp", "sweet", "sour", "strong", "weak", "fast", "slow", "deep",
    "shallow", "thick", "thin", "wide", "narrow", "full", "empty",
    "clean", "dirty", "smooth", "rough", "bright", "dark", "loud",
    "quiet", "straight", "bent", "red", "green", "blue", "yellow",
    "white", "black", "grey", "brown", "tall", "true", "false",
    "alive", "dead", "near", "far", "young", "rich", "poor", "safe",
    "dangerous", "wild", "tame", "holy", "cursed",
  ],
  pronoun: [
    "i", "you", "they", "we", "he-she", "this", "that", "here", "there",
    "what", "who", "where", "when", "why", "how",
    "you-plural", "it", "someone", "something", "anyone", "nobody",
    "nothing", "all", "some", "none", "other", "same", "both",
  ],
  numbers: [
    "one", "two", "three", "four", "five", "six", "seven", "eight",
    "nine", "ten", "hundred", "thousand", "many", "few", "half",
    "eleven", "twelve", "twenty", "thirty", "first", "last", "pair",
    "double", "zero", "whole", "quarter",
  ],
  spatial: [
    "left", "right", "above", "below", "front", "behind", "inside",
    "outside", "between", "among", "over", "under", "around", "beside",
    "against", "across", "through", "along", "beyond", "top", "bottom",
    "middle", "edge", "corner", "side", "end", "beginning",
  ],
  time: [
    "today", "yesterday", "tomorrow", "morning", "evening", "week",
    "month", "winter", "summer", "autumn", "spring-season", "hour",
    "moment", "always", "never", "often", "seldom", "now", "then",
    "before", "after", "soon", "late", "early",
  ],
  abstract: [
    "name", "word", "song", "story", "year", "love", "fear", "hope",
    "peace", "war", "dream", "spirit", "god", "law", "gift", "trade",
    "home", "road", "village", "town", "king", "servant", "free",
    "game", "joy", "grief", "truth", "lie", "honour", "meaning",
    "soul", "mind", "heart-soul", "will", "fate", "luck", "sin",
    "virtue", "wisdom", "folly", "memory", "custom", "oath", "promise",
    "shame", "pride", "courage", "cowardice", "justice", "mercy",
    "debt", "ritual", "sacrifice", "temple", "tomb", "grave", "priest",
    "warrior", "slave", "lord", "hero", "craft", "skill", "tradition",
    "birth", "marriage", "funeral", "feast", "question", "answer-noun",
    "silence", "music",
  ],
} as const;

/** Ordered flat list of all meanings, with duplicates removed. A meaning
 * that appears in multiple clusters (e.g. "fly" as animal + motion) is
 * kept at its first occurrence and `clusterOfBasic240` returns that cluster.
 */
export const BASIC_240: readonly Meaning[] = (() => {
  const seen = new Set<Meaning>();
  const out: Meaning[] = [];
  for (const members of Object.values(CLUSTERS)) {
    for (const m of members) {
      if (seen.has(m)) continue;
      seen.add(m);
      out.push(m);
    }
  }
  return out;
})();

/** Cluster name for any Basic-240 meaning, or undefined. */
const MEANING_TO_CLUSTER: Record<Meaning, string> = (() => {
  const out: Record<Meaning, string> = {};
  for (const [name, members] of Object.entries(CLUSTERS)) {
    for (const m of members) out[m] = name;
  }
  return out;
})();

export function clusterOfBasic240(meaning: Meaning): string | undefined {
  return MEANING_TO_CLUSTER[meaning];
}

// ---------------------------------------------------------------------------
// Deterministic form generator
// ---------------------------------------------------------------------------


export interface FormPhonology {
  /** Consonants allowed in onset position. */
  onsets: Phoneme[];
  /** Vowels (short). */
  vowels: Phoneme[];
  /** Consonants allowed in coda position. Empty = strict CV. */
  codas?: Phoneme[];
  /** Phoneme appended to every generated form ("suffix flavor"), optional. */
  flavour?: Phoneme[];
  /** Minimum / maximum syllable count. */
  minSyllables?: number;
  maxSyllables?: number;
}

/**
 * Given a language's inventory + a meaning string, produce a deterministic
 * phonotactically-valid form. The same (phonology, meaning) input always
 * gives the same output; two different languages gave different forms.
 */
export function generateForm(
  meaning: Meaning,
  phonology: FormPhonology,
): WordForm {
  const h = fnv1a(meaning);
  const minS = phonology.minSyllables ?? 2;
  const maxS = phonology.maxSyllables ?? 3;
  const syllables = minS + ((h >>> 1) % Math.max(1, maxS - minS + 1));
  const out: Phoneme[] = [];
  let cursor = h;
  const bits = () => {
    cursor = (cursor * 1103515245 + 12345) >>> 0;
    return cursor;
  };
  for (let i = 0; i < syllables; i++) {
    const c = phonology.onsets[bits() % Math.max(1, phonology.onsets.length)]!;
    const v = phonology.vowels[bits() % Math.max(1, phonology.vowels.length)]!;
    out.push(c, v);
    // 40% coda for non-final, 20% for final if codas allowed.
    if (phonology.codas && phonology.codas.length > 0) {
      const codaOdds = i === syllables - 1 ? 0.2 : 0.4;
      if ((bits() % 100) / 100 < codaOdds) {
        out.push(phonology.codas[bits() % phonology.codas.length]!);
      }
    }
  }
  if (phonology.flavour) {
    for (const p of phonology.flavour) out.push(p);
  }
  return out;
}

/**
 * Build a full 240-entry lexicon by filling any missing meanings with
 * deterministic forms. Hand-authored entries in `core` are kept verbatim;
 * anything else is generated from `phonology`.
 */
export function fillMissing(core: Lexicon, phonology: FormPhonology): Lexicon {
  const out: Lexicon = { ...core };
  for (const m of BASIC_240) {
    if (!out[m]) out[m] = generateForm(m, phonology);
  }
  return out;
}
