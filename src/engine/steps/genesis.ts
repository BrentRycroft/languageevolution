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
import { assignInflectionClass } from "../morphology/inflectionClass";
import {
  attemptTargetedDerivation,
  recordDerivationChain,
} from "../genesis/mechanisms/targetedDerivation";
import { tryCommitCoinage } from "../lexicon/word";
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
                kind: "productivity",
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
    // Phase 29 Tranche 5c+1: remove the OLD sense AFTER commit succeeds.
    // Pre-fix the removeSense ran upstream of the polysemy roll, so a
    // failed roll left lang.lexicon with the old form but lang.words
    // with no sense for the meaning — silent dual-truth desync.
    if (isReplacement) {
      // The new word entry was just added by tryCommitCoinage; drop
      // any other word that still carries this meaning's sense.
      // (removeSense filters lang.words, dropping the meaning from
      //  every other word and removing words whose only sense was the
      //  meaning. The new word still carries its newly-added sense.)
      const newKey = outcome.form.join("");
      const before = lang.words ?? [];
      lang.words = before.filter((w) => {
        if (w.formKey === newKey) return true;
        const remaining = w.senses.filter((s) => s.meaning !== outcome.meaning);
        if (remaining.length === 0) return false;
        if (remaining.length !== w.senses.length) {
          const oldPrim = w.senses[w.primarySenseIndex]?.meaning;
          w.senses = remaining;
          const np = remaining.findIndex((s) => s.meaning === oldPrim);
          w.primarySenseIndex = np >= 0 ? np : 0;
        }
        return true;
      });
    }
    lang.lexicon[outcome.meaning] = outcome.form;
    lang.wordFrequencyHints[outcome.meaning] = 0.4;
    lang.wordOrigin[outcome.meaning] = isReplacement
      ? `lexical-replacement:${outcome.originTag}`
      : outcome.originTag;
    if (lang.registerOf && !lang.registerOf[outcome.meaning]) {
      lang.registerOf[outcome.meaning] = outcome.register ?? "low";
    }
    // Phase 29 Tranche 5e: assign an inflection class for the new
    // coinage. Lexical replacement preserves the existing class
    // (the meaning's grammar slot doesn't change just because the
    // form did); pure new coinages get a freshly-rolled class biased
    // by the form's phonological shape.
    if (!isReplacement) {
      if (!lang.inflectionClass) lang.inflectionClass = {};
      if (!lang.inflectionClass[outcome.meaning]) {
        lang.inflectionClass[outcome.meaning] = assignInflectionClass(outcome.form, rng);
      }
    }
    // Phase 29 Tranche 4i: when the mechanism surfaced its
    // constituents, record an etymology chain so the UI can show
    // "← cat + tree" for a compound, "← speak + -er" for a
    // derivation, etc. Targeted-derivation already populates this
    // field upstream via recordDerivationChain; the MECHANISMS
    // path was previously dropping all etymology.
    if (!isReplacement && outcome.sources) {
      if (!lang.wordOriginChain) lang.wordOriginChain = {};
      const s = outcome.sources;
      if (s.partMeanings && s.partMeanings.length >= 2) {
        lang.wordOriginChain[outcome.meaning] = {
          tag: outcome.originTag,
          from: s.partMeanings[0]!,
          via: s.partMeanings[1]!,
        };
      } else if (s.donorLangId && s.donorMeaning) {
        lang.wordOriginChain[outcome.meaning] = {
          tag: outcome.originTag,
          from: s.donorMeaning,
          via: `←${s.donorLangId}`,
        };
      }
    }
    pushEvent(lang, {
      generation,
      kind: isReplacement ? "lexical_replacement" : "coinage",
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
