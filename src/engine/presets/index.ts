import type { SimulationConfig } from "../types";
import { presetPIE } from "./pie";
import { presetGermanic } from "./germanic";
import { presetRomance } from "./romance";
import { presetBantu } from "./bantu";
import { presetTokipona } from "./tokipona";
import { presetEnglish } from "./english";
import { defaultConfig } from "../config";
import { withEnrichedLexicon } from "../lexicon/enrichPreset";

/**
 * index.ts
 *
 * Built-in language seeds (PIE, Germanic, Romance, Bantu, Toki Pona, English). Key exports: PresetDescriptor, PRESETS, findPreset.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export interface PresetDescriptor {
  id: string;
  label: string;
  description: string;
  build: () => SimulationConfig;
}

// MEGA-overhaul Lane E: every catalog preset is handed to the user with its seed
// lexicon enriched to a realistic floor (~1000 entries) via `withEnrichedLexicon`.
// The bare `presetX()` builders keep their small curated seed (used by unit tests that
// probe core mechanics on a clean inventory); the floor is applied here, at the table
// the app actually loads from (`findPreset(...).build()`).
export const PRESETS: readonly PresetDescriptor[] = [
  {
    id: "default",
    label: "Default (Swadesh core)",
    description: "Swadesh-style core enriched to a ~1000-word starting vocabulary.",
    build: () => withEnrichedLexicon(defaultConfig()),
  },
  {
    id: "pie",
    label: "Proto-Indo-European",
    description: "Laryngeals, 8 cases, 3 genders, SOV. Classic reconstructed starting point.",
    build: () => withEnrichedLexicon(presetPIE()),
  },
  {
    id: "germanic",
    label: "Proto-Germanic",
    description: "PIE after Grimm's Law. Voiceless stops spirantized, voiced stops devoiced.",
    build: () => withEnrichedLexicon(presetGermanic()),
  },
  {
    id: "romance",
    label: "Latin / Proto-Romance",
    description: "Late Latin with 5 cases shifting toward Romance SVO.",
    build: () => withEnrichedLexicon(presetRomance()),
  },
  {
    id: "bantu",
    label: "Proto-Bantu",
    description: "CV syllables, noun-class prefixes, tone already on.",
    build: () => withEnrichedLexicon(presetBantu()),
  },
  {
    id: "tokipona",
    label: "Toki pona",
    description:
      "Minimal conlang: 120 root words, 9 consonants + 5 vowels, SVO, no inflection. A minimalist starting point.",
    build: () => withEnrichedLexicon(presetTokipona()),
  },
  {
    id: "english",
    label: "Modern English",
    description:
      "General-American English in narrow IPA: SVO, no case, articles, -s plural, -ed past, -ing progressive. Drift it forward to see what English becomes.",
    build: () => withEnrichedLexicon(presetEnglish()),
  },
];

export function findPreset(id: string | undefined): PresetDescriptor | undefined {
  return PRESETS.find((p) => p.id === id);
}
