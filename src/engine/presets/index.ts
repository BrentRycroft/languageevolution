import type { SimulationConfig } from "../types";
import { presetPIE } from "./pie";
import { presetGermanic } from "./germanic";
import { presetRomance } from "./romance";
import { presetBantu } from "./bantu";
import { presetTokipona } from "./tokipona";
import { presetEnglish } from "./english";
import { defaultConfig } from "../config";

export interface PresetDescriptor {
  id: string;
  label: string;
  description: string;
  build: () => SimulationConfig;
}

export const PRESETS: readonly PresetDescriptor[] = [
  {
    id: "default",
    label: "Default (Swadesh core)",
    description: "44-entry Swadesh-style lexicon; the default starting point.",
    build: defaultConfig,
  },
  {
    id: "pie",
    label: "Proto-Indo-European",
    description: "Laryngeals, 8 cases, 3 genders, SOV. Classic reconstructed starting point.",
    build: presetPIE,
  },
  {
    id: "germanic",
    label: "Proto-Germanic",
    description: "PIE after Grimm's Law. Voiceless stops spirantized, voiced stops devoiced.",
    build: presetGermanic,
  },
  {
    id: "romance",
    label: "Latin / Proto-Romance",
    description: "Late Latin with 5 cases shifting toward Romance SVO.",
    build: presetRomance,
  },
  {
    id: "bantu",
    label: "Proto-Bantu",
    description: "CV syllables, noun-class prefixes, tone already on.",
    build: presetBantu,
  },
  {
    id: "tokipona",
    label: "Toki pona",
    description:
      "Minimal conlang: 120 root words, 9 consonants + 5 vowels, SVO, no inflection. A minimalist starting point.",
    build: presetTokipona,
  },
  {
    id: "english",
    label: "Modern English",
    description:
      "General-American English in narrow IPA: SVO, no case, articles, -s plural, -ed past, -ing progressive. Drift it forward to see what English becomes.",
    build: presetEnglish,
  },
];

export function findPreset(id: string | undefined): PresetDescriptor | undefined {
  return PRESETS.find((p) => p.id === id);
}
