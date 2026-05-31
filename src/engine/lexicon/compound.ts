import type { Language, WordForm, Meaning } from "../types";
import type { Rng } from "../rng";
import { setLexiconForm } from "./mutate";

/**
 * Phase 34 Tranche 34a: compound-word maintenance.
 *
 * For every transparent (non-fossilized) compound, recompute the
 * surface form from the current forms of its constituent parts plus
 * any optional linker. So when "moon" drifts from /muːn/ → /mun/,
 * "moonlight" automatically tracks: /muːnlɛɪt/ → /munlɛɪt/. This
 * eliminates the issue where a transparent compound and its parts
 * could drift independently and lose their semantic transparency.
 *
 * Fossilization: each transparent compound rolls a low per-gen
 * probability (`FOSSIL_RATE`) of becoming opaque, after which it
 * drifts independently like any other root. Real-world: "lord" <
 * Old English "hlafweard" (loaf-warden) was transparent, then
 * fossilized and eroded into a single opaque morpheme over
 * centuries.
 */

const FOSSIL_RATE = 0.005;

export function recomposeCompound(
  lang: Language,
  meaning: Meaning,
): WordForm | null {
  const meta = lang.compounds?.[meaning];
  if (!meta || meta.fossilized) return null;
  const parts: WordForm[] = [];
  for (const partMeaning of meta.parts) {
    const f = lang.lexicon[partMeaning];
    if (!f || f.length === 0) return null; // a part dropped — bail
    parts.push(f);
  }
  if (parts.length === 0) return null;
  const linker = meta.linker ?? [];
  const out: WordForm = [];
  for (let i = 0; i < parts.length; i++) {
    if (i > 0 && linker.length > 0) out.push(...linker);
    out.push(...parts[i]!);
  }
  return out;
}

export function updateCompounds(
  lang: Language,
  rng: Rng,
  generation: number,
): { recomposed: number; fossilized: number } {
  if (!lang.compounds) return { recomposed: 0, fossilized: 0 };
  let recomposed = 0;
  let fossilized = 0;
  for (const meaning of Object.keys(lang.compounds)) {
    const meta = lang.compounds[meaning]!;
    if (meta.fossilized) continue;
    // Roll fossilization first — once decided, this compound stops
    // tracking its parts.
    if (rng.chance(FOSSIL_RATE)) {
      meta.fossilized = true;
      meta.fossilizedGen = generation;
      fossilized++;
      continue;
    }
    const next = recomposeCompound(lang, meaning);
    if (!next) continue;
    const current = lang.lexicon[meaning];
    if (current && current.join("") === next.join("")) continue;
    setLexiconForm(lang, meaning, next, {
      bornGeneration: generation,
      origin: "compound-recompose",
    });
    recomposed++;
  }
  return { recomposed, fossilized };
}

/**
 * Add a compound entry. Used by presets at language birth and by
 * genesis when a compound coinage fires.
 */
export function addCompound(
  lang: Language,
  meaning: Meaning,
  parts: Meaning[],
  bornGeneration: number,
  options: { linker?: WordForm } = {},
): void {
  if (!lang.compounds) lang.compounds = {};
  lang.compounds[meaning] = {
    parts: parts.slice(),
    linker: options.linker?.slice(),
    fossilized: false,
    bornGeneration,
  };
  // Eagerly recompose so the lexicon stores the correct initial form.
  const initial = recomposeCompound(lang, meaning);
  if (initial && initial.length > 0) {
    setLexiconForm(lang, meaning, initial, {
      bornGeneration,
      origin: "compound",
      // Phase 53 T4: addCompound has explicit parts; expose them as
      // structural etymology so downstream consumers (UI, sound-change
      // boundary detection) can read.
      morphStructure: {
        origin: "compound",
        parts: parts.slice(),
      },
    });
  }
}

/**
 * Meaning-layer Stage A1: add a DERIVATION entry — a word authored as a base
 * plus a derivational affix. Mechanically a compound of `[base, affix]`
 * (suffix) or `[affix, base]` (prefix), so it reuses the compound recompose +
 * drift machinery (the derived form tracks its base as the base drifts), but
 * records `morphStructure.origin: "derivation"`. The affix's form must live in
 * `seedLexicon` (it's a bound morpheme); the base must be in `seedLexicon`.
 *
 * This is the derivational analogue of `addCompound` — it lets presets encode a
 * word AS a root + affix building block rather than an atomic form.
 */
export function addDerivation(
  lang: Language,
  meaning: Meaning,
  base: Meaning,
  affix: Meaning,
  bornGeneration: number,
  options: { position?: "prefix" | "suffix" } = {},
): void {
  const position = options.position ?? "suffix";
  const parts = position === "prefix" ? [affix, base] : [base, affix];
  if (!lang.compounds) lang.compounds = {};
  lang.compounds[meaning] = {
    parts: parts.slice(),
    fossilized: false,
    bornGeneration,
  };
  const initial = recomposeCompound(lang, meaning);
  if (initial && initial.length > 0) {
    setLexiconForm(lang, meaning, initial, {
      bornGeneration,
      origin: "derivation",
      morphStructure: {
        origin: "derivation",
        base,
        affix,
      },
    });
  }
}
