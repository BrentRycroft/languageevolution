import type { Language, SimulationConfig, WordForm } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { recordInnovation } from "../lexicon/socialContagion";
import { isFormLegal } from "../phonology/wordShape";
import { isVowel, isConsonant } from "../phonology/ipa";
import { featuresOf } from "../phonology/features";

const LEARNER_CADENCE = 4;

const MARKED_PHONEMES = new Set([
  "y", "ø", "œ", "ɥ",
  "pʼ", "tʼ", "kʼ", "qʼ", "tsʼ", "tʃʼ",
  "ǀ", "ǃ", "ǂ", "ǁ", "ʘ",
  "ʈ", "ɖ", "ɳ", "ʂ", "ʐ",
  "ʔp", "ʔt", "ʔk",
]);

const PHONEME_REPLACEMENT: Record<string, string> = {
  "y": "i",
  "ø": "e",
  "œ": "ɛ",
  "ɥ": "j",
  "pʼ": "p",
  "tʼ": "t",
  "kʼ": "k",
  "qʼ": "k",
  "tsʼ": "ts",
  "tʃʼ": "tʃ",
  "ʈ": "t",
  "ɖ": "d",
  "ɳ": "n",
  "ʂ": "ʃ",
  "ʐ": "ʒ",
  "ʔp": "p",
  "ʔt": "t",
  "ʔk": "k",
};

function tooComplexCoda(form: WordForm): boolean {
  if (form.length < 3) return false;
  const last = form[form.length - 1]!;
  const prev = form[form.length - 2]!;
  const prev2 = form[form.length - 3]!;
  return isConsonant(last) && isConsonant(prev) && isConsonant(prev2);
}

function simplifyCoda(form: WordForm): WordForm | null {
  if (!tooComplexCoda(form)) return null;
  const out = form.slice();
  out.splice(out.length - 2, 1);
  return out;
}

function attemptMarkednessReduction(
  lang: Language,
  rng: Rng,
): { phoneme: string; replacement: string } | null {
  const inv = lang.phonemeInventory.segmental;
  const candidates = inv.filter((p) => MARKED_PHONEMES.has(p));
  if (candidates.length === 0) return null;
  if (!rng.chance(0.05 * lang.conservatism)) return null;
  const phoneme = candidates[rng.int(candidates.length)]!;
  const replacement = PHONEME_REPLACEMENT[phoneme] ?? null;
  if (!replacement) return null;
  return { phoneme, replacement };
}

export function stepLearner(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  void config;
  if (generation % LEARNER_CADENCE !== 0) return;

  const reduction = attemptMarkednessReduction(lang, rng);
  if (reduction) {
    let mutated = 0;
    for (const m of Object.keys(lang.lexicon)) {
      const form = lang.lexicon[m]!;
      if (!form.includes(reduction.phoneme)) continue;
      const next: WordForm = form.map((p) => (p === reduction.phoneme ? reduction.replacement : p));
      if (!isFormLegal(m, next)) continue;
      recordInnovation(lang, m, form, next, generation, "learner");
      lang.lexicon[m] = next;
      lang.lastChangeGeneration[m] = generation;
      mutated++;
    }
    lang.phonemeInventory.segmental = lang.phonemeInventory.segmental.filter(
      (p) => p !== reduction.phoneme,
    );
    if (mutated > 0) {
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `learner-driven markedness loss: /${reduction.phoneme}/ → /${reduction.replacement}/ (${mutated} word${mutated === 1 ? "" : "s"})`,
      });
    }
  }

  if (rng.chance(0.04 * lang.conservatism)) {
    let codaSimplifications = 0;
    for (const m of Object.keys(lang.lexicon)) {
      const form = lang.lexicon[m]!;
      const freq = lang.wordFrequencyHints[m] ?? 0.5;
      if (freq > 0.4) continue;
      const simplified = simplifyCoda(form);
      if (!simplified) continue;
      if (!isFormLegal(m, simplified)) continue;
      if (rng.chance(0.4)) {
        recordInnovation(lang, m, form, simplified, generation, "learner");
        lang.lexicon[m] = simplified;
        lang.lastChangeGeneration[m] = generation;
        codaSimplifications++;
        if (codaSimplifications >= 3) break;
      }
    }
    if (codaSimplifications > 0) {
      pushEvent(lang, {
        generation,
        kind: "sound_change",
        description: `learner-driven coda simplification: ${codaSimplifications} low-frequency word${codaSimplifications === 1 ? "" : "s"} lost a medial coda`,
      });
    }
  }

  void isVowel;
  void featuresOf;
}
