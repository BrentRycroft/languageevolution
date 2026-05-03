import type { Language, SimulationConfig, SimulationState } from "../types";
import { tryCoin } from "../genesis/apply";
import { lexicalNeed } from "../genesis/need";
import { neighborsOf } from "../semantics/neighbors";
import type { Rng } from "../rng";
import { genesisRulesFor, pushEvent } from "./helpers";
import { isFormLegal } from "../phonology/wordShape";
import { lexicalCapacity } from "../lexicon/tier";
import { realismMultiplier } from "../phonology/rate";
import { DERIVATION_TARGETS } from "../lexicon/derivation_targets";
import {
  attemptTargetedDerivation,
  recordDerivationChain,
} from "../genesis/mechanisms/targetedDerivation";
import { tryCommitCoinage, removeSense } from "../lexicon/word";
import {
  findSuffixByTag,
  registerSuffixUsage,
  categoryLabel,
} from "../lexicon/derivation";

export function stepGenesis(
  lang: Language,
  config: SimulationConfig,
  state: SimulationState,
  rng: Rng,
  generation: number,
): void {
  const rules = genesisRulesFor(config);
  const lexSize = Object.keys(lang.lexicon).length;
  const capacity = lang.lexicalCapacity ?? lexicalCapacity(lang, generation);
  const deficit = Math.max(0, capacity - lexSize);
  const base = 0.2 + 0.05 * deficit;
  const noise = 0.5 + rng.next();
  const target = Math.max(1, Math.round(base * noise * lang.conservatism));
  const atCapacity = lexSize >= capacity;
  const gateProb = atCapacity
    ? 0.25 * lang.conservatism
    : Math.min(1, 0.5 + 0.5 * lang.conservatism);
  // Clear an expired catch-up window so it doesn't linger across gens.
  // Hoisted above the gateProb early-return so the flag is cleaned up
  // even on generations when the genesis loop is skipped.
  if (
    lang.vocabularyCatchUpUntil !== undefined &&
    generation >= lang.vocabularyCatchUpUntil
  ) {
    delete lang.vocabularyCatchUpUntil;
  }
  if (!rng.chance(gateProb)) return;
  // Phase 24: pass seed lengths to lexicalNeed so it can flag eroded
  // existing meanings as candidates for lexical replacement.
  const seedLengths: Record<string, number> = {};
  for (const m of Object.keys(config.seedLexicon)) {
    const f = config.seedLexicon[m];
    if (f && f.length > 0) seedLengths[m] = f.length;
  }
  const need = lexicalNeed(lang, state.tree, { seedLengths });
  // Catch-up active iff the deadline is still in the future (the deletion
  // above handles cleanup; this is just the read-side flag).
  const catchUpActive =
    lang.vocabularyCatchUpUntil !== undefined &&
    generation < lang.vocabularyCatchUpUntil;
  const targetedProb = catchUpActive ? 0.85 : 0.4;
  for (let i = 0; i < target; i++) {
    // Targeted derivation pass: prefer composing abstracts from
    // existing roots when the language has the morphology. Probability
    // jumps to 0.85 during a tier-2 catch-up window (Phase 20f-3) so
    // the literacy transition surfaces a burst of new abstracts.
    if (rng.chance(targetedProb)) {
      const derived = tryTargetedDerivation(lang, rng);
      if (derived) {
        if (isFormLegal(derived.meaning, derived.form)) {
          // Phase 21c: collision-aware commit. On homophone clash with
          // an unrelated existing meaning, roll a polysemy probability;
          // on rejection, skip this coinage (loop retries on next iter).
          const commit = tryCommitCoinage(
            lang,
            derived.meaning,
            derived.form,
            rng,
            {
              bornGeneration: generation,
              origin: "derivation",
            },
          );
          if (!commit.committed) continue;
          lang.lexicon[derived.meaning] = derived.form;
          lang.wordFrequencyHints[derived.meaning] = 0.4;
          lang.wordOrigin[derived.meaning] = "derivation";
          recordDerivationChain(lang, derived);
          // Phase 22: register the suffix usage. Productive suffixes
          // (post-threshold) suppress per-coinage events — the rule
          // applies silently like a plural marker — but the etymology
          // still lives in lang.wordOriginChain[derived.meaning] so the
          // UI can show "← think + -or" on hover.
          const suffix = findSuffixByTag(lang, derived.suffixTag);
          let wasProductive = false;
          let justBecameProductive = false;
          if (suffix) {
            wasProductive = !!suffix.productive;
            const r = registerSuffixUsage(suffix, generation);
            justBecameProductive = r.justBecameProductive;
            if (justBecameProductive) {
              pushEvent(lang, {
                generation,
                kind: "grammaticalize",
                description:
                  `productive rule established: V + ${suffix.tag} = ${categoryLabel(suffix.category)} (after ${suffix.usageCount} attestations)`,
              });
            }
          }
          // Suppress the per-coinage event when the rule is *already*
          // productive (i.e. before this call). The threshold-crossing
          // call still gets one final coinage event so the third
          // attestation appears alongside the establishment event for
          // explanatory continuity.
          if (!wasProductive) {
            pushEvent(lang, {
              generation,
              kind: "coinage",
              description: commit.viaPolysemy
                ? `derivation+polysemy: ${derived.meaning} ← ${derived.rootMeaning} + ${derived.suffixTag} (homophone of existing word)`
                : `derivation: ${derived.meaning} ← ${derived.rootMeaning} + ${derived.suffixTag}`,
            });
          }
          continue;
        }
      }
    }

    const outcome = tryCoin(
      lang,
      state.tree,
      rules,
      config.genesis.ruleWeights,
      config.genesis.globalRate * realismMultiplier(config),
      rng,
      need,
    );
    if (!outcome) break;
    if (!isFormLegal(outcome.meaning, outcome.form)) continue;
    // Phase 24: detect lexical replacement. When the target meaning
    // already exists in the lexicon AND the new form is different, this
    // coinage represents lexical replacement of an over-eroded form
    // (the lexicalNeed shrinkage component flagged it). Strip the old
    // form's sense from lang.words BEFORE the new commit so the words
    // table doesn't accumulate stale entries.
    const isReplacement =
      !!lang.lexicon[outcome.meaning] &&
      lang.lexicon[outcome.meaning]!.join("") !== outcome.form.join("");
    let oldFormStr = "";
    if (isReplacement) {
      oldFormStr = lang.lexicon[outcome.meaning]!.join("");
      removeSense(lang, outcome.meaning);
    }
    // Phase 21c: collision-aware commit. The form may already exist as
    // a word for another meaning; in that case roll polysemy/reject.
    const commit = tryCommitCoinage(
      lang,
      outcome.meaning,
      outcome.form,
      rng,
      {
        bornGeneration: generation,
        register: outcome.register,
        origin: isReplacement ? "lexical-replacement" : outcome.originTag,
      },
    );
    if (!commit.committed) continue;
    lang.lexicon[outcome.meaning] = outcome.form;
    lang.wordFrequencyHints[outcome.meaning] = 0.4;
    lang.wordOrigin[outcome.meaning] = isReplacement
      ? `lexical-replacement:${outcome.originTag}`
      : outcome.originTag;
    if (lang.registerOf && !lang.registerOf[outcome.meaning]) {
      lang.registerOf[outcome.meaning] = outcome.register ?? "low";
    }
    pushEvent(lang, {
      generation,
      kind: "coinage",
      description: isReplacement
        ? `lexical-replacement: ${outcome.meaning} (${oldFormStr} → ${outcome.form.join("")}) via ${outcome.originTag}`
        : commit.viaPolysemy
          ? `${outcome.originTag}+polysemy: ${outcome.meaning} (homophone of existing word)`
          : `${outcome.originTag}: ${outcome.meaning}`,
    });
  }
}

/**
 * Look for any DERIVATION_TARGETS entry where:
 *   - the language doesn't yet have this meaning
 *   - the language DOES have the root meaning
 *   - the language has a suffix in the required category
 * If multiple candidates, pick a random one.
 */
function tryTargetedDerivation(lang: Language, rng: Rng) {
  const candidates: string[] = [];
  for (const meaning of Object.keys(DERIVATION_TARGETS)) {
    if (lang.lexicon[meaning]) continue; // already have it
    const target = DERIVATION_TARGETS[meaning]!;
    if (!lang.lexicon[target.root]) continue;
    candidates.push(meaning);
  }
  if (candidates.length === 0) return null;
  const meaning = candidates[rng.int(candidates.length)]!;
  return attemptTargetedDerivation(lang, meaning, rng);
}

export function bootstrapNeologismNeighbors(lang: Language): void {
  for (const m of Object.keys(lang.lexicon)) {
    if (!m.includes("-") && !/-(er|ness|ic|al|ine|intens)$/.test(m)) continue;
    const parts = m.split("-");
    for (const p of parts) {
      const hint = lang.wordFrequencyHints[p];
      if (hint && !lang.wordFrequencyHints[m]) {
        lang.wordFrequencyHints[m] = Math.max(
          lang.wordFrequencyHints[m] ?? 0,
          hint * 0.7,
        );
      }
    }
    if (neighborsOf(m).length > 0 || (lang.localNeighbors[m] ?? []).length > 0) continue;
    const proposed = new Set<string>();
    for (const p of parts) {
      for (const n of neighborsOf(p)) proposed.add(n);
      for (const n of lang.localNeighbors[p] ?? []) proposed.add(n);
    }
    const usable = Array.from(proposed).filter(
      (n) => n !== m && lang.lexicon[n] !== undefined,
    );
    if (usable.length > 0) {
      lang.localNeighbors[m] = usable.slice(0, 5);
    }
  }
}
