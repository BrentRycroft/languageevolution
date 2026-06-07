import type {
  Language,
  SimulationConfig,
  SimulationState,
  WordMorphStructure,
  WordMorphStructureOrigin,
} from "../types";
import { satGet, satSet } from "../lexicon/satellites";
import type { CoinageOutcome } from "../genesis/apply";
import { tryCoin } from "../genesis/apply";
import { lexicalNeed } from "../genesis/need";
import { findSemanticGap, coinKeylessForGap } from "../genesis/semanticGap";
import { neighborsOf } from "../semantics/neighbors";
import type { Rng } from "../rng";
import { genesisRulesFor, pushEvent } from "./helpers";
import { isFormLegal } from "../phonology/wordShape";
import { lexicalCapacity } from "../lexicon/tier";
import { realismMultiplier } from "../phonology/rate";
import { DERIVATION_TARGETS } from "../lexicon/derivation_targets";
import { CONCEPTS } from "../lexicon/concepts";
import { assignInflectionClass, assignNounDeclensionClass } from "../morphology/inflectionClass";
import { posOf } from "../lexicon/pos";
import { recordedParts } from "../lexicon/word";
import {
  langPhonotacticScore,
  repairToProfile,
  pickEpentheticVowel,
} from "../phonology/phonotactics";
import {
  attemptTargetedDerivation,
  attemptProductiveDerivation,
  recordDerivationChain,
} from "../genesis/mechanisms/targetedDerivation";
import { tryCommitCoinage, rebuildFormKeyIndex } from "../lexicon/word";
import { recordCoinageStructure } from "../lexicon/compound";
import { lexGet, lexHas, lexKeys, lexSet } from "../lexicon/access";
import {
  findSuffixByTag,
  registerSuffixUsage,
  categoryLabel,
} from "../lexicon/derivation";
import { isFeatureActive } from "../modules/legacyGate";

/**
 * genesis.ts
 *
 * Per-generation step orchestrators called from simulation.ts (one file per major substep). Key exports: stepGenesis, bootstrapNeologismNeighbors.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

/**
 * Phase 53 T4: convert a coinage mechanism's `originTag` + `sources`
 * into a structural-etymology record that lives on the resulting
 * Word. Lets the UI etymology view, sound-change boundary detection,
 * and reanalysis read HOW the form was coined without reverse-
 * engineering it from the surface.
 */
function buildMorphStructure(
  outcome: CoinageOutcome,
): WordMorphStructure | undefined {
  const origin = outcome.originTag as WordMorphStructureOrigin;
  const sources = outcome.sources;
  // Map origin tags onto the structural enum. Tags we don't know
  // about return undefined (no metadata is better than wrong metadata).
  const KNOWN: ReadonlyArray<WordMorphStructureOrigin> = [
    "compound", "derivation", "ablaut", "reduplication",
    "template", "conversion", "borrow", "blending", "clipping",
    "ideophone", "calque", "seed",
  ];
  if (!KNOWN.includes(origin)) return undefined;
  const out: WordMorphStructure = { origin };
  if (sources?.partMeanings && sources.partMeanings.length > 0) {
    if (origin === "compound") {
      out.parts = sources.partMeanings.slice();
    } else {
      // derivation / ablaut / reduplication: first part is the base.
      out.base = sources.partMeanings[0];
      if (sources.partMeanings.length > 1) {
        out.parts = sources.partMeanings.slice();
      }
    }
  }
  if (sources?.via && origin === "derivation") {
    out.affix = sources.via;
  }
  if (sources?.donorLangId) {
    out.donorLanguageId = sources.donorLangId;
  }
  if (sources?.donorMeaning) {
    out.donorMeaning = sources.donorMeaning;
  }
  return out;
}

/**
 * Inc 4 step 3 — per-generation probability that a language coins a KEYLESS word into a
 * salient empty region of its meaning space (point-native storage, no concept key). Low, so
 * keyless coinage is a rare innovation alongside the gloss-keyed mechanisms.
 */
const KEYLESS_GAP_COINAGE_RATE = 0.1;

export function stepGenesis(
  lang: Language,
  config: SimulationConfig,
  state: SimulationState,
  rng: Rng,
  generation: number,
): void {
  // Phase 46a-migration: coinage gated on the coinage module.
  // Legacy fallback: always on (coinage was unconditional).
  if (!isFeatureActive(lang, "semantic:coinage", () => true)) return;
  const rules = genesisRulesFor(config);
  const lexSize = lexKeys(lang).length;
  const capacity = lang.lexicalCapacity ?? lexicalCapacity(lang, generation);
  const deficit = Math.max(0, capacity - lexSize);
  // Phase 60: aggressive coinage volume — user wanted "magnitudes
  // higher" coinage. Pre-Phase-60 base was 0.2 + 0.05*deficit (1-3
  // attempts/gen). New base 1.5 + 0.25*deficit produces 4-25
  // attempts/gen so coinage events surface as a major event family
  // alongside sound-change.
  const base = 1.5 + 0.25 * deficit;
  const noise = 0.5 + rng.next();
  const target = Math.max(2, Math.round(base * noise * lang.conservatism));
  const atCapacity = lexSize >= capacity;
  // Phase 38g: literary brake on coinage rate. Tier-2+ literate
  // languages still coin words but at a measured pace; drops the
  // gate probability by up to 40% at full literacy.
  const literary = lang.literaryStability ?? 0;
  const literaryGateMult = 1 - 0.4 * literary;
  const gateProb = atCapacity
    ? 0.25 * lang.conservatism * literaryGateMult
    : Math.min(1, (0.5 + 0.5 * lang.conservatism) * literaryGateMult);
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
              // Phase 53 T4: targeted derivation knows base + suffix.
              morphStructure: {
                origin: "derivation",
                base: derived.rootMeaning,
                affix: derived.suffixTag,
              },
            },
          );
          if (!commit.committed) continue;
          lexSet(lang, derived.meaning, derived.form);
          satSet(lang, "wordFrequencyHints", derived.meaning, 0.4);
          satSet(lang, "wordOrigin", derived.meaning, "derivation");
          recordDerivationChain(lang, derived);
          // Record the derived word's structure so recordedParts() sees coined
          // derivations, not just seed ones (concept-native structure checks).
          recordCoinageStructure(
            lang,
            derived.meaning,
            [derived.rootMeaning, derived.suffixTag],
            generation,
          );
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
      lexHas(lang, outcome.meaning) &&
      lexGet(lang, outcome.meaning)!.join("") !== outcome.form.join("");
    let oldFormStr = "";
    if (isReplacement) {
      oldFormStr = lexGet(lang, outcome.meaning)!.join("");
    }
    // Phase 21c: collision-aware commit. The form may already exist as
    // a word for another meaning; in that case roll polysemy/reject.
    // Phase 53 T4: build the structural-etymology record for the new
    // word from the mechanism's reported sources, so the UI etymology
    // view + sound-change boundary detection can read it later.
    // Phase 67 T3: phonotactic repair — when the proposed form
    // violates the language's phonotactic profile (e.g. Hawaiian-style
    // CV preset producing CCC clusters), insert epenthetic vowels to
    // nativize the form rather than rejecting outright. Loanword
    // adaptation in real languages works this way: Spanish "estress"
    // for English "stress".
    if (lang.phonotacticProfile && lang.phonotacticProfile.strictness > 0) {
      const score = langPhonotacticScore(lang, outcome.form);
      if (score < 0.5) {
        outcome.form = repairToProfile(
          outcome.form,
          lang.phonotacticProfile,
          pickEpentheticVowel(lang),
        );
      }
    }
    const morphStructure = buildMorphStructure(outcome);
    const commit = tryCommitCoinage(
      lang,
      outcome.meaning,
      outcome.form,
      rng,
      {
        bornGeneration: generation,
        register: outcome.register,
        origin: isReplacement ? "lexical-replacement" : outcome.originTag,
        morphStructure,
      },
    );
    if (!commit.committed) continue;
    // Phase 38g: track total coinages produced.
    if (!isReplacement) {
      lang.totalCoinages = (lang.totalCoinages ?? 0) + 1;
    }
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
      // Phase 29 Tranche 1e: lang.words just got replaced by a fresh
      // filtered copy, so the form-key index is stale. Rebuild it.
      rebuildFormKeyIndex(lang);
    }
    lexSet(lang, outcome.meaning, outcome.form);
    satSet(lang, "wordFrequencyHints", outcome.meaning, 0.4);
    satSet(lang, "wordOrigin", outcome.meaning, isReplacement
      ? `lexical-replacement:${outcome.originTag}`
      : outcome.originTag);
    // Record structure for coined compounds (mechanisms that report ≥2
    // constituents) so recordedParts() covers coinage, not just seed compounds.
    if (
      !isReplacement &&
      outcome.sources?.partMeanings &&
      outcome.sources.partMeanings.length >= 2
    ) {
      recordCoinageStructure(lang, outcome.meaning, outcome.sources.partMeanings, generation);
    }
    if (lang.registerOf && !lang.registerOf[outcome.meaning]) {
      lang.registerOf[outcome.meaning] = outcome.register ?? "low";
    }
    // Phase 29 Tranche 5e + Phase 64 T1: assign inflection /
    // declension class for the new coinage. Verbs get
    // `inflectionClass` (Latin 4-way: -āre / -ēre / -ere / -īre);
    // nouns get `nounDeclensionClass` (Latin 5-way: -a / -o / cons /
    // -u / -e). Lexical replacement preserves the existing class —
    // the grammar slot doesn't change just because the form did.
    if (!isReplacement) {
      const pos = posOf(outcome.meaning);
      if (pos === "verb") {
        if (!lang.inflectionClass) lang.inflectionClass = {};
        if (!lang.inflectionClass[outcome.meaning]) {
          lang.inflectionClass[outcome.meaning] = assignInflectionClass(outcome.form, rng);
        }
      } else if (pos === "noun" || pos === "other") {
        if (!lang.nounDeclensionClass) lang.nounDeclensionClass = {};
        if (!lang.nounDeclensionClass[outcome.meaning]) {
          lang.nounDeclensionClass[outcome.meaning] = assignNounDeclensionClass(outcome.form, rng);
        }
      }
    }
    // Phase 29 Tranche 4i: when the mechanism surfaced its
    // constituents, record an etymology chain so the UI can show
    // "← cat + tree" for a compound, "← speak + -er" for a
    // derivation, etc. Targeted-derivation already populates this
    // field upstream via recordDerivationChain; the MECHANISMS
    // path was previously dropping all etymology.
    if (!isReplacement && outcome.sources) {
      const s = outcome.sources;
      if (s.partMeanings && s.partMeanings.length >= 2) {
        satSet(lang, "wordOriginChain", outcome.meaning, {
          tag: outcome.originTag,
          from: s.partMeanings[0]!,
          via: s.partMeanings[1]!,
        });
      } else if (s.donorLangId && s.donorMeaning) {
        satSet(lang, "wordOriginChain", outcome.meaning, {
          tag: outcome.originTag,
          from: s.donorMeaning,
          via: `←${s.donorLangId}`,
        });
      }
    }
    // Phase 47 T11: opaque coinage. When the meaning is marked
    // canBeOpaqueCoined in CONCEPTS (e.g., "dog", "boy", "girl",
    // "wolf"), with ~15% probability the etymology chain gets
    // overwritten with an "opaque-coined" marker. Models the
    // linguistic reality that some words have no recoverable
    // etymology (English "dog", "girl" — origins disputed/lost).
    if (!isReplacement) {
      const concept = CONCEPTS[outcome.meaning];
      if (concept?.canBeOpaqueCoined && rng.chance(0.15)) {
        satSet(lang, "wordOriginChain", outcome.meaning, { tag: "opaque-coined" });
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

  // Inc 4 step 3 — keyless gap-coinage. At a low rate, coin a word into a salient EMPTY
  // region of the meaning space: a point-native lexeme stored by point + form with NO
  // concept/gloss key (a gloss-less record in lang.lexemes), its label emergent. This drives the
  // point-native storage path from the live loop. Silent for now (surfaced in a later
  // increment). The rng.chance gate is the LAST genesis draw, so it perturbs only this
  // generation's downstream stream onward — gen-0 (no genesis) stays byte-identical.
  if (rng.chance(KEYLESS_GAP_COINAGE_RATE)) {
    const gap = findSemanticGap(lang);
    if (gap) coinKeylessForGap(lang, gap);
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
  // Phase 34 Tranche 34b: 30% of the time, fall through to opportunistic
  // productive derivation — the language uses any productive suffix on
  // any compatible root, even if the resulting meaning isn't in the
  // hardcoded DERIVATION_TARGETS table. This is what real productivity
  // looks like: once -er is productive in English, you can derive
  // "speaker", "writer", "runner" without anyone explicitly licensing
  // each one.
  if (rng.chance(0.3)) {
    const productive = attemptProductiveDerivation(lang, rng);
    if (productive) return productive;
  }
  const candidates: string[] = [];
  for (const meaning of Object.keys(DERIVATION_TARGETS)) {
    if (lexHas(lang, meaning)) continue; // already have it
    const target = DERIVATION_TARGETS[meaning]!;
    if (!lexHas(lang, target.root)) continue;
    candidates.push(meaning);
  }
  if (candidates.length === 0) return null;
  const meaning = candidates[rng.int(candidates.length)]!;
  return attemptTargetedDerivation(lang, meaning, rng);
}

export function bootstrapNeologismNeighbors(lang: Language): void {
  for (const m of lexKeys(lang)) {
    // Stage B: bootstrap frequency + neighbours from the RECORDED content
    // constituents of a derived/compound meaning (concept-native), rather
    // than splitting the English gloss on hyphens. Bound morphemes are
    // filtered out — semantic neighbours come from content parts, not affixes.
    const parts = recordedParts(lang, m, { contentOnly: true });
    if (!parts) continue;
    for (const p of parts) {
      const hint = satGet(lang, "wordFrequencyHints", p);
      if (hint && !satGet(lang, "wordFrequencyHints", m)) {
        satSet(lang, "wordFrequencyHints", m, Math.max(
          satGet(lang, "wordFrequencyHints", m) ?? 0,
          hint * 0.7,
        ));
      }
    }
    if (neighborsOf(m).length > 0 || (lang.localNeighbors[m] ?? []).length > 0) continue;
    const proposed = new Set<string>();
    for (const p of parts) {
      for (const n of neighborsOf(p)) proposed.add(n);
      for (const n of lang.localNeighbors[p] ?? []) proposed.add(n);
    }
    const usable = Array.from(proposed).filter(
      (n) => n !== m && lexHas(lang, n),
    );
    if (usable.length > 0) {
      lang.localNeighbors[m] = usable.slice(0, 5);
    }
  }
}
