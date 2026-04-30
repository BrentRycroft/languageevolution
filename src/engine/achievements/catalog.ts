import type { SimulationState } from "../types";
import { leafIds } from "../tree/split";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  /** Unicode glyph shown in the trophy strip. Kept ascii-safe for SVG fallback. */
  icon: string;
  predicate: (state: SimulationState) => boolean;
}

/**
 * Catalog of runtime-detectable achievements. All predicates are pure
 * functions of the state, so the detector can re-run them cheaply each step.
 * Thresholds are chosen to sit inside a single 500-gen run with a default
 * preset, but none should fire in the first ~30 gens.
 */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "polyglot",
    label: "Polyglot",
    description: "At least six living daughter languages at once.",
    icon: "◎",
    predicate: (s) => aliveCount(s) >= 6,
  },
  {
    id: "museum",
    label: "Museum",
    description: "Witness a sound law reach retirement.",
    icon: "▣",
    predicate: (s) => anyLanguage(s, (l) => (l.retiredRules ?? []).length > 0),
  },
  {
    id: "grimm",
    label: "Grimm would approve",
    description: "Three lenition rules active simultaneously in one language.",
    icon: "⟲",
    predicate: (s) =>
      anyLanguage(s, (l) =>
        (l.activeRules ?? []).filter((r) => r.family === "lenition").length >= 3,
      ),
  },
  {
    id: "vowel-harmony",
    label: "Vowel harmony",
    description: "A harmony rule reached strength ≥ 0.6.",
    icon: "∿",
    predicate: (s) =>
      anyLanguage(s, (l) =>
        (l.activeRules ?? []).some(
          (r) => r.family === "harmony" && r.strength >= 0.6,
        ),
      ),
  },
  {
    id: "chain-reaction",
    label: "Chain reaction",
    description: "A single language has 5+ active rules at once.",
    icon: "⛓",
    predicate: (s) => anyLanguage(s, (l) => (l.activeRules ?? []).length >= 5),
  },
  {
    id: "split-personality",
    label: "Split personality",
    description: "Register split (high/low) covers ≥ 20% of a lexicon.",
    icon: "◐",
    predicate: (s) =>
      anyLanguage(s, (l) => {
        const lex = Object.keys(l.lexicon).length;
        if (lex < 10) return false;
        const tagged = Object.keys(l.registerOf ?? {}).filter((m) => l.lexicon[m]).length;
        return tagged / lex >= 0.2;
      }),
  },
  {
    id: "methuselah",
    label: "Methuselah",
    description: "A living language has reached age 300 generations.",
    icon: "⌛",
    // Skip the proto language: its `birthGeneration` is 0, so it
    // would trivially "live to 300" without ever splitting or
    // evolving meaningfully. Filter by `birthGeneration > 0` so
    // only daughter languages count.
    predicate: (s) =>
      anyLanguage(s, (l) => !l.extinct && l.birthGeneration > 0 && s.generation - l.birthGeneration >= 300),
  },
  {
    id: "tonogenesis",
    label: "Tonogenesis",
    description: "Any language has developed phonemic tone.",
    icon: "♪",
    predicate: (s) => anyLanguage(s, (l) => l.phonemeInventory.usesTones),
  },
];

export const ACHIEVEMENTS_BY_ID: Record<string, Achievement> = Object.fromEntries(
  ACHIEVEMENTS.map((a) => [a.id, a]),
);

function aliveCount(state: SimulationState): number {
  return leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  ).length;
}

function anyLanguage(
  state: SimulationState,
  predicate: (lang: SimulationState["tree"][string]["language"]) => boolean,
): boolean {
  for (const id of Object.keys(state.tree)) {
    if (predicate(state.tree[id]!.language)) return true;
  }
  return false;
}
