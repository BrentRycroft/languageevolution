import type { Lexicon, Phoneme, SimulationConfig, WordForm } from "../types";
import { CONCEPT_IDS, tierOf } from "./concepts";
import { generateForm, type FormPhonology } from "./basic240";
import { isVowel } from "../phonology/ipa";

/**
 * enrichPreset.ts
 *
 * MEGA-overhaul Lane E: bring every preset's seed lexicon up to a realistic floor
 * (a natural language opens with thousands of words, not a few hundred). Rather than
 * hand-author thousands of entries per preset, we coin the missing concepts with the
 * SAME phonotactically-native generator the engine uses (`generateForm`), driven by a
 * phonology DERIVED from the preset's own authored forms. Deriving the inventory from
 * what the author already wrote means coined words automatically respect the preset's
 * phoneme set, its CV/closed-syllable shape, and its IPA conventions (ɹ-not-r for
 * English, tone-marked vowels for Bantu, laryngeals for PIE) — so they pass
 * `validatePresetIpa` for free. Authored forms are never overwritten; only gaps fill.
 *
 * The fill walks concepts in tier order (tier 0 = most core first) so the floor is
 * reached with the highest-frequency vocabulary. Deterministic (generateForm hashes
 * the meaning), so a preset still yields a byte-stable seed lexicon.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

/** The communicative floor every built-in preset is enriched to. */
export const PRESET_LEXICON_FLOOR = 1000;

/** Infer onsets / nuclei / codas / syllable range from a lexicon's authored forms. */
export function derivePhonology(lex: Lexicon): FormPhonology {
  const vowels = new Set<Phoneme>();
  const onsets = new Set<Phoneme>();
  const codas = new Set<Phoneme>();
  let minS = Infinity;
  let maxS = 1;
  for (const form of Object.values(lex)) {
    if (!form || form.length === 0) continue;
    const isV = (form as WordForm).map((p) => isVowel(p));
    let syllables = 0;
    for (let i = 0; i < form.length; i++) {
      const p = form[i]!;
      if (isV[i]) {
        vowels.add(p);
        syllables++;
        continue;
      }
      const nextIsVowel = i + 1 < form.length && isV[i + 1];
      const prevIsVowel = i > 0 && isV[i - 1]!;
      if (nextIsVowel) onsets.add(p);
      // coda: a consonant after a vowel that ends the word or precedes another consonant
      if (prevIsVowel && !nextIsVowel) codas.add(p);
      // cluster-internal / isolated consonant: keep it usable as an onset
      if (!nextIsVowel && !prevIsVowel) onsets.add(p);
    }
    if (syllables > 0) {
      minS = Math.min(minS, syllables);
      maxS = Math.max(maxS, syllables);
    }
  }
  if (!Number.isFinite(minS)) minS = 1;
  minS = Math.max(1, Math.min(minS, 2));
  maxS = Math.max(minS, Math.min(maxS, 4));
  return {
    onsets: onsets.size > 0 ? [...onsets] : ["t", "k", "n", "s", "l"],
    vowels: vowels.size > 0 ? [...vowels] : ["a", "e", "i", "o", "u"],
    codas: [...codas],
    minSyllables: minS,
    maxSyllables: maxS,
  };
}

/**
 * Return a copy of `seed` enriched up to `floor` entries by coining the highest-tier
 * concepts it is missing, using a phonology derived from `seed` itself. Already at or
 * above the floor → returned unchanged (copy).
 *
 * `colexification` (the preset's `seedColexification` map, winner → absorbed[]) is
 * respected: an absorbed meaning deliberately has NO own lexicon entry (it resolves to
 * its winner's form), so coining one would un-colexify it. Those meanings are reserved
 * and skipped — the floor is reached with other concepts instead.
 */
export function enrichToFloor(
  seed: Lexicon,
  colexification?: Record<string, readonly string[]>,
  floor: number = PRESET_LEXICON_FLOOR,
): Lexicon {
  const out: Lexicon = { ...seed };
  let count = Object.keys(out).length;
  if (count >= floor) return out;
  const reserved = new Set<string>();
  if (colexification) {
    for (const absorbed of Object.values(colexification)) {
      for (const m of absorbed) reserved.add(m);
    }
  }
  const phonology = derivePhonology(seed);
  // Tier order (0 first); ties keep CONCEPT_IDS order — stable + deterministic.
  const ordered = [...CONCEPT_IDS].sort((a, b) => tierOf(a) - tierOf(b));
  for (const meaning of ordered) {
    if (count >= floor) break;
    if (out[meaning] || reserved.has(meaning)) continue;
    const form = generateForm(meaning, phonology);
    if (form.length === 0) continue;
    out[meaning] = form;
    count++;
  }
  return out;
}

/**
 * Catalog-level enrichment: return `cfg` with its seed lexicon brought up to the floor.
 * Applied where a preset is handed to the user (the `PRESETS` table / `findPreset`), so
 * the app starts every preset with a realistically rich vocabulary, while the bare
 * preset builders keep their curated seed for unit tests that probe core mechanics on a
 * clean inventory. Colexification-aware via the config's own `seedColexification`.
 */
export function withEnrichedLexicon(cfg: SimulationConfig): SimulationConfig {
  return {
    ...cfg,
    seedLexicon: enrichToFloor(cfg.seedLexicon ?? {}, cfg.seedColexification),
  };
}
