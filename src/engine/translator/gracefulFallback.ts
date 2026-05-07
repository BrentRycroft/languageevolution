import type { Language, Meaning, WordForm } from "../types";
import { fnv1a, makeRng } from "../rng";
import { MECHANISM_COMPOUND } from "../genesis/mechanisms/compound";
import { MECHANISM_DERIVATION } from "../genesis/mechanisms/derivation";
import { MECHANISM_CLIPPING } from "../genesis/mechanisms/clipping";
import { MECHANISM_BLENDING } from "../genesis/mechanisms/blending";
import { MECHANISM_IDEOPHONE } from "../genesis/mechanisms/ideophone";
import type { CoinageMechanism } from "../genesis/mechanisms/types";
import { phonotacticFit } from "../genesis/phonotactics";
import { otFit } from "../phonology/ot";
import { isFormLegal } from "../phonology/wordShape";
import { setLexiconForm } from "../lexicon/mutate";

/**
 * Phase 50 T3: graceful translator fallback.
 *
 * Final rung after every other resolution path in `resolveLemma` has
 * returned null. Coins a fresh form for the unknown lemma using the
 * language's own phonotactics, mechanism set, and inventory — then
 * writes it into the lexicon as a real coinage event so subsequent
 * translations resolve via Rung 1 (direct lookup) and the form
 * thereafter evolves under sound change like any native word.
 *
 * Determinism: the per-call RNG is seeded by `fnv1a(\`fallback|<id>|<lemma>\`)`,
 * so the same (language, lemma) pair always produces the same form.
 *
 * Mechanism order: compound → derivation → blending → clipping →
 * ideophone. Compound + derivation are preferred because they tie the
 * fresh form to existing lexicon (better recall + etymology); ideophone
 * is the last resort that doesn't depend on existing words at all.
 *
 * The user's "translator should be able to parse anything" requirement
 * means this rung never returns null when the language has at least one
 * phoneme of each major class — ideophone is the floor.
 */

const FALLBACK_MECHANISMS: ReadonlyArray<CoinageMechanism> = [
  MECHANISM_COMPOUND,
  MECHANISM_DERIVATION,
  MECHANISM_BLENDING,
  MECHANISM_CLIPPING,
  MECHANISM_IDEOPHONE,
];

export interface GracefulFallbackResult {
  form: WordForm;
  mechanism: string;
  glossNote: string;
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
    const score =
      0.5 * phonotacticFit(candidate.form, lang) + 0.5 * otFit(candidate.form, lang);
    if (!best || score > best.score) {
      best = { form: candidate.form, mechanism: mech.id, score };
    }
    if (best.score >= 0.7) break;
  }

  if (!best) {
    const ideoCandidate = MECHANISM_IDEOPHONE.tryCoin(lang, lemma, {}, rng);
    if (!ideoCandidate) return null;
    best = {
      form: ideoCandidate.form,
      mechanism: MECHANISM_IDEOPHONE.id,
      score: 0,
    };
  }

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
