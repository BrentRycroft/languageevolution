import type { Language, Meaning, WordForm } from "../types";
import { fnv1a, makeRng } from "../rng";
import { MECHANISM_COMPOUND } from "../genesis/mechanisms/compound";
import { MECHANISM_DERIVATION } from "../genesis/mechanisms/derivation";
import { MECHANISM_CLIPPING } from "../genesis/mechanisms/clipping";
import { MECHANISM_BLENDING } from "../genesis/mechanisms/blending";
import type { CoinageMechanism } from "../genesis/mechanisms/types";
import { phonotacticFit } from "../genesis/phonotactics";
import { otFit } from "../phonology/ot";
import { isFormLegal } from "../phonology/wordShape";
import { setLexiconForm } from "../lexicon/mutate";

/**
 * Phase 50 T3 + Phase 53 T1: graceful translator fallback.
 *
 * Coins a fresh form ONLY when it grounds in the language's existing
 * lexicon. Mechanisms enabled here all compose from existing lexemes:
 *
 *   - COMPOUND: takes two existing lemmas, concatenates their forms.
 *   - DERIVATION: takes an existing lemma, attaches one of the
 *     language's own derivational suffixes / morphemes.
 *   - BLENDING: takes two existing lemmas, splices overlapping segs.
 *   - CLIPPING: takes one existing long form, truncates it.
 *
 * Phase 53 T1 dropped IDEOPHONE — it generated from raw phoneme
 * inventory without any lexicon basis, which produced nonsense
 * coinages on every untranslatable input. The cost: when none of the
 * four lexicon-grounded mechanisms succeeds (e.g. empty lexicon,
 * lemma's stem isn't in the language), this returns null and the
 * caller emits the literal-quote fallback. Small lexicons therefore
 * see more `?` placeholders, by design.
 *
 * Determinism: the per-call RNG is seeded by `fnv1a(\`fallback|<id>|<lemma>\`)`,
 * so the same (language, lemma) pair always produces the same form.
 *
 * The mechanism is also expected to expose grounding evidence on its
 * `sources.partMeanings` field. We require at least one of those parts
 * to be in `lang.lexicon` — otherwise we treat the coinage as
 * ungrounded and reject it.
 */

const FALLBACK_MECHANISMS: ReadonlyArray<CoinageMechanism> = [
  MECHANISM_COMPOUND,
  MECHANISM_DERIVATION,
  MECHANISM_BLENDING,
  MECHANISM_CLIPPING,
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
  return parts.some((m) => lang.lexicon[m] !== undefined);
}

export function attemptGracefulFallback(
  lang: Language,
  lemma: Meaning,
  generation: number,
): GracefulFallbackResult | null {
  if (lang.lexicon[lemma]) return null;

  const seed = fnv1a(`fallback|${lang.id}|${lemma}`);
  const rng = makeRng(seed);

  let best: { form: WordForm; mechanism: string; score: number } | null = null;
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
      best = { form: candidate.form, mechanism: mech.id, score };
    }
    if (best.score >= 0.7) break;
  }

  if (!best) return null;

  setLexiconForm(lang, lemma, best.form, {
    bornGeneration: generation,
    origin: "translator-coined",
  });
  if (!lang.wordOrigin) lang.wordOrigin = {};
  lang.wordOrigin[lemma] = `translator-coined:${best.mechanism}`;
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
