import type {
  Language,
  Meaning,
  WordForm,
  WordMorphStructure,
  WordMorphStructureOrigin,
} from "../types";
import { fnv1a, makeRng } from "../rng";
import { MECHANISM_COMPOUND } from "../genesis/mechanisms/compound";
import type { CoinageMechanism } from "../genesis/mechanisms/types";
import { phonotacticFit } from "../genesis/phonotactics";
import { otFit } from "../phonology/ot";
import { isFormLegal } from "../phonology/wordShape";
import { setLexiconForm } from "../lexicon/mutate";
import { findWordByForm } from "../lexicon/word";
import { lexHas } from "../lexicon/access";
import { satSet } from "../lexicon/satellites";

/**
 * Phase 50 T3 + Phase 53 T1 + Phase 58.5: graceful translator
 * fallback — compound-only.
 *
 * Pre-Phase-58.5 the fallback considered four mechanisms (compound,
 * derivation, blending, clipping). The user reported that coining
 * via DERIVATION produced "entirely different" surface forms when
 * the affix-decomposition stem wasn't lexicalised — e.g. `undone`
 * grounding to a random base + suffix because `done` (the stem
 * parseEnglishAffix yielded) wasn't in the lang's lexicon.
 *
 * Phase 58.5 narrows the policy: coining ONLY fires for compound-
 * decomposable lemmas (two existing lexemes concatenated). The
 * coined form is conservatively recorded as an "attestation" — a
 * lexicon entry whose form is the literal concatenation of its
 * parts; no productive-affix machinery is involved.
 *
 * Words that don't compose-from-existing-lexemes get the literal-
 * quote fallback. The synth-affix rungs (Phase 49) still fire
 * BEFORE this rung when the lemma decomposes via prefix/suffix and
 * the stem IS lexicalised — they don't write to lexicon, they just
 * render. So `undone` against modern English (with `do` lexicalised)
 * resolves via synth-neg-affix to un-do, not via fallback coinage.
 *
 * Determinism: the per-call RNG is seeded by
 * `fnv1a(\`fallback|<id>|<lemma>\`)`, so the same (language, lemma)
 * pair always produces the same form.
 */

const FALLBACK_MECHANISMS: ReadonlyArray<CoinageMechanism> = [
  MECHANISM_COMPOUND,
];

export interface GracefulFallbackResult {
  form: WordForm;
  mechanism: string;
  glossNote: string;
}

function isGrounded(
  lang: Language,
  candidate: { form: WordForm; sources?: { partMeanings?: string[] } },
): boolean {
  const parts = candidate.sources?.partMeanings;
  if (!parts || parts.length === 0) return false;
  // At least one cited source must be a real lexicon entry.
  return parts.some((m) => lexHas(lang, m));
}

export function attemptGracefulFallback(
  lang: Language,
  lemma: Meaning,
  generation: number,
): GracefulFallbackResult | null {
  if (lexHas(lang, lemma)) return null;

  const seed = fnv1a(`fallback|${lang.id}|${lemma}`);
  const rng = makeRng(seed);

  let best:
    | {
        form: WordForm;
        mechanism: string;
        score: number;
        sources?: { partMeanings?: string[]; via?: string };
      }
    | null = null;
  for (const mech of FALLBACK_MECHANISMS) {
    let candidate;
    try {
      candidate = mech.tryCoin(lang, lemma, {}, rng);
    } catch {
      continue;
    }
    if (!candidate) continue;
    if (!isFormLegal(lemma, candidate.form)) continue;
    if (!isGrounded(lang, candidate)) continue;
    const score =
      0.5 * phonotacticFit(candidate.form, lang) + 0.5 * otFit(candidate.form, lang);
    if (!best || score > best.score) {
      best = {
        form: candidate.form,
        mechanism: mech.id,
        score,
        sources: candidate.sources,
      };
    }
    if (best.score >= 0.7) break;
  }

  if (!best) return null;

  setLexiconForm(lang, lemma, best.form, {
    bornGeneration: generation,
    origin: "translator-coined",
  });
  satSet(lang, "wordOrigin", lemma, `translator-coined:${best.mechanism}`);
  // Phase 53 T4: structural etymology on the new Word.
  const word = findWordByForm(lang, best.form);
  if (word) {
    const originTag = best.mechanism.replace("mechanism.", "");
    const KNOWN: ReadonlyArray<WordMorphStructureOrigin> = [
      "compound", "derivation", "ablaut", "reduplication", "template",
      "conversion", "borrow", "blending", "clipping", "ideophone",
      "calque", "seed",
    ];
    if (KNOWN.includes(originTag as WordMorphStructureOrigin)) {
      const morphStructure: WordMorphStructure = {
        origin: originTag as WordMorphStructureOrigin,
      };
      const partMeanings = best.sources?.partMeanings;
      if (partMeanings && partMeanings.length > 0) {
        if (originTag === "compound") {
          morphStructure.parts = partMeanings.slice();
        } else {
          morphStructure.base = partMeanings[0];
          if (partMeanings.length > 1) morphStructure.parts = partMeanings.slice();
        }
      }
      if (best.sources?.via && originTag === "derivation") {
        morphStructure.affix = best.sources.via;
      }
      word.morphStructure = morphStructure;
    }
  }
  if (!lang.events) lang.events = [];
  lang.events.push({
    generation,
    kind: "coinage",
    description: `coined "${lemma}" via ${best.mechanism.replace("mechanism.", "")} (translator-prompted)`,
  });

  return {
    form: best.form,
    mechanism: best.mechanism,
    glossNote: `coined: ${best.mechanism.replace("mechanism.", "")}`,
  };
}
