/**
 * synonymSelect.ts — G4: commonness / markedness-aware synonym selection.
 *
 * `markednessOf(lang, meaning, form)` scores how MARKED (rare, register-restricted)
 * a particular form is among a meaning's synonyms — lower = more common / unmarked,
 * so the neutral default is the lowest-markedness form. The score is AGNOSTIC: it is
 * derived from the language's OWN frequencies, with the G1 corpus-rank prior only as
 * a tie-shaping prior for English-keyed concepts. No hardcoded English judgements.
 *
 * Blend:
 *   - form usage (per-sense `weight`, the language's own dominance signal for this
 *     form within the meaning): higher usage → lower markedness.
 *   - corpus-rank prior (`rankOf(meaning)` from G1): a rarer CONCEPT is marked at a
 *     higher baseline. Same across a meaning's forms, so it shifts the meaning's
 *     baseline without overriding the per-form usage signal.
 *
 * Pure + deterministic (no RNG, no mutation): a function of the stored sense weight
 * and the static corpus rank.
 */
import type { Language, Meaning, WordForm } from "../types";
import { rankOf, MAX_RANK } from "../semantics/corpusRank";
import { findWordsByMeaning, formKeyOf, selectSynonyms } from "./word";
import { satGet } from "./satellites";
import { lexFormById, idForGloss } from "./access";
import { geometricNeighbors } from "../semantics/neighbors";
import { lexPoint } from "../semantics/meaningPoint";
import { hasEmbedding } from "../semantics/embeddings";
import { cosineFixed } from "../semantics/vec";

/**
 * Minimum cosine between a meaning's point and a geometric neighbour's point for the
 * neighbour to count as a TIGHT near-synonym (not merely a loose associate). High so
 * neutral text stays unmarked — only genuinely close concepts contribute extra forms.
 */
const NEAR_SYNONYM_COSINE = 0.7;
/** How many geometric neighbours to probe (then cosine-filtered). */
const NEIGHBOR_K = 4;

/** Weight of form usage vs. the corpus-rank concept prior in the markedness blend. */
const USAGE_WEIGHT = 0.7;
const RANK_WEIGHT = 0.3;

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/**
 * Markedness of `form` as a realisation of `meaning` in `lang`. Lower = more common /
 * unmarked (the neutral default); higher = rarer / register-restricted. Range [0, 1].
 */
export function markednessOf(lang: Language, meaning: Meaning, form: WordForm): number {
  const key = formKeyOf(form);
  // The form's in-language usage for this meaning: its sense weight. Synonyms carry a
  // lower weight than the dominant/primary form, so a rare synonym reads as more marked.
  let usage = 0;
  for (const w of findWordsByMeaning(lang, meaning)) {
    if (w.formKey !== key) continue;
    const s = w.senses.find((sn) => sn.meaning === meaning);
    if (s) usage = s.weight;
    break;
  }
  const usageMark = 1 - clamp01(usage); // low usage → high markedness
  // Concept-level prior: rarer concepts (high corpus rank) sit at a higher baseline.
  const rankPrior = rankOf(meaning) / Math.max(1, MAX_RANK);
  return clamp01(USAGE_WEIGHT * usageMark + RANK_WEIGHT * rankPrior);
}

/** The language's primary form for a meaning, or undefined when it has none. */
function formOf(lang: Language, meaning: Meaning): WordForm | undefined {
  const id = idForGloss(lang, meaning);
  return id !== undefined ? lexFormById(lang, id) : undefined;
}

/**
 * The broadened synonym candidate set for `meaning` (G4 Task 2): every distinct form the
 * language could surface for this meaning. Beyond the Phase-37 spawned synonyms it adds
 *   - TIGHT geometric near-synonyms: forms the language already uses for geometrically
 *     close concepts (cosine ≥ NEAR_SYNONYM_COSINE), and
 *   - recorded colexification partners (`colexifiedAs`).
 * Deduped by form-key, primary first (the Phase-37 order is preserved at the front).
 * Pure + deterministic — geometric neighbours come from the static integer-exact geometry.
 */
export function synonymCandidates(lang: Language, meaning: Meaning): WordForm[] {
  const out: WordForm[] = [];
  const seen = new Set<string>();
  const push = (form: WordForm | undefined) => {
    if (!form || form.length === 0) return;
    const key = formKeyOf(form);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(form);
  };

  // 1. Phase-37 synonyms (primary first), unchanged.
  for (const w of selectSynonyms(lang, meaning)) push(w.form);

  // 2. Tight geometric near-synonyms: only when the meaning has a real point, so the
  //    "nearest" concepts are distributionally meaningful (not hash-fallback noise).
  if (hasEmbedding(meaning)) {
    const here = lexPoint(meaning);
    for (const nbr of geometricNeighbors(meaning, NEIGHBOR_K)) {
      if (!hasEmbedding(nbr)) continue;
      if (cosineFixed(here, lexPoint(nbr)) < NEAR_SYNONYM_COSINE) continue;
      push(formOf(lang, nbr));
    }
  }

  // 3. Recorded colexification partners — meanings whose form this meaning's word absorbs.
  for (const partner of satGet(lang, "colexifiedAs", meaning) ?? []) {
    push(formOf(lang, partner));
  }

  return out;
}

export interface RegisterPickCtx {
  /** "high" / literary / marked → allow a marked synonym; "neutral"/"low"/undefined → unmarked default. */
  register?: "high" | "low" | "neutral";
  /** Form-keys already surfaced in the current sentence (rotation tracker). */
  recentlyUsed?: ReadonlySet<string>;
}

/**
 * G4 selection rule. Picks which form to surface for `meaning`, register- AND
 * commonness-aware:
 *   - neutral / low / unset register → the lowest-markedness (most common, unmarked) form;
 *   - marked register ("high" / literary) → allow the highest-markedness (rare / literary) form.
 * The rotation tracker (`recentlyUsed`) skips a form already used this sentence so an
 * utterance varies. Deterministic — markedness is deterministic and ties break by form-key.
 * Returns undefined only when the meaning has no form at all.
 */
export function pickRegisterWeightedSynonym(
  lang: Language,
  meaning: Meaning,
  ctx: RegisterPickCtx,
): WordForm | undefined {
  const candidates = synonymCandidates(lang, meaning);
  if (candidates.length === 0) return formOf(lang, meaning);
  if (candidates.length === 1) return candidates[0];

  // Rank by markedness; stable, deterministic tie-break by form-key.
  const ranked = candidates
    .map((form) => ({ form, key: formKeyOf(form), mark: markednessOf(lang, meaning, form) }))
    .sort((a, b) => a.mark - b.mark || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // Marked register prefers the most marked candidate; neutral prefers the least marked.
  const marked = ctx.register === "high";
  const order = marked ? [...ranked].reverse() : ranked;

  // Honour the rotation tracker: take the first candidate in preference order not already
  // used this sentence; fall back to the top preference when all have been used.
  const recent = ctx.recentlyUsed;
  if (recent) {
    const fresh = order.find((c) => !recent.has(c.key));
    if (fresh) return fresh.form;
  }
  return order[0]!.form;
}
