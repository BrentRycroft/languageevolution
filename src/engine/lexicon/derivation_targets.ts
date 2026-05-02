import type { Meaning } from "../types";
import type { DerivationCategory } from "./derivation";

/**
 * Curated table mapping derivable abstract concepts to their root + the
 * category of suffix that should produce them. When the genesis loop is
 * choosing what to coin next, it consults this table first: if the target
 * meaning is here AND the language has the root AND has a suffix in the
 * required category, it prefers the targeted derivation over a random
 * mechanism.
 *
 * Entries follow English's etymological logic (freedom ← free + -dom)
 * because that's the linguistic pattern most users will recognise. Other
 * languages whose roots happen to match (e.g. a Romance descendant with a
 * "free" cognate) can still use this table; their suffix will be
 * synthesised from the language's own phonology.
 */
export interface DerivationTarget {
  root: Meaning;
  via: DerivationCategory;
}

export const DERIVATION_TARGETS: Record<Meaning, DerivationTarget> = {
  // dominion-abstract (-dom): realm/state of
  freedom: { root: "free", via: "dominionAbstract" },
  kingdom: { root: "king", via: "dominionAbstract" },
  wisdom: { root: "wise", via: "dominionAbstract" },

  // abstract noun (-ness, -hood, -ship, -ity): quality / state of being
  happiness: { root: "happy", via: "abstractNoun" },
  sadness: { root: "sad", via: "abstractNoun" },
  kindness: { root: "kind", via: "abstractNoun" },
  loneliness: { root: "lonely", via: "abstractNoun" },
  greatness: { root: "great", via: "abstractNoun" },
  goodness: { root: "good", via: "abstractNoun" },
  weakness: { root: "weak", via: "abstractNoun" },
  brotherhood: { root: "brother", via: "abstractNoun" },
  sisterhood: { root: "sister", via: "abstractNoun" },
  childhood: { root: "child", via: "abstractNoun" },
  motherhood: { root: "mother", via: "abstractNoun" },
  fatherhood: { root: "father", via: "abstractNoun" },
  friendship: { root: "friend", via: "abstractNoun" },
  hardship: { root: "hard", via: "abstractNoun" },
  fellowship: { root: "fellow", via: "abstractNoun" },
  scholarship: { root: "scholar", via: "abstractNoun" },

  // nominalisation (-tion, -ment, -age): act/result of
  agreement: { root: "agree", via: "nominalisation" },
  movement: { root: "move", via: "nominalisation" },
  payment: { root: "pay", via: "nominalisation" },
  judgement: { root: "judge", via: "nominalisation" },
  development: { root: "develop", via: "nominalisation" },
  shipment: { root: "ship", via: "nominalisation" },
  creation: { root: "create", via: "nominalisation" },
  protection: { root: "protect", via: "nominalisation" },
  decision: { root: "decide", via: "nominalisation" },
  passage: { root: "pass", via: "nominalisation" },
  storage: { root: "store", via: "nominalisation" },
  marriage: { root: "marry", via: "nominalisation" },

  // agentive (-er, -or, -ist): X who does Y
  runner: { root: "run", via: "agentive" },
  teacher: { root: "teach", via: "agentive" },
  speaker: { root: "speak", via: "agentive" },
  writer: { root: "write", via: "agentive" },
  reader: { root: "read", via: "agentive" },
  singer: { root: "sing", via: "agentive" },
  hunter: { root: "hunt", via: "agentive" },
  fighter: { root: "fight", via: "agentive" },
  builder: { root: "build", via: "agentive" },
  worker: { root: "work", via: "agentive" },
  driver: { root: "drive", via: "agentive" },
  player: { root: "play", via: "agentive" },
  thinker: { root: "think", via: "agentive" },
  killer: { root: "kill", via: "agentive" },

  // diminutive (-let, -kin)
  piglet: { root: "pig", via: "diminutive" },
  booklet: { root: "book", via: "diminutive" },
  droplet: { root: "drop", via: "diminutive" },

  // adjectival (-ic, -al, -ish, -ous): of/like X
  childish: { root: "child", via: "adjectival" },
  foolish: { root: "fool", via: "adjectival" },
  reddish: { root: "red", via: "adjectival" },
  oldish: { root: "old", via: "adjectival" },
};

/**
 * Look up the derivation chain for a target meaning, or null if none
 * exists. Used by the targeted-derivation mechanism + by UI etymology
 * displays.
 */
export function derivationFor(meaning: Meaning): DerivationTarget | null {
  return DERIVATION_TARGETS[meaning] ?? null;
}
