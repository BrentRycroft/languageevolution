import type {
  Language,
  LanguageNode,
  LanguageTree,
  SimulationConfig,
  SimulationState,
} from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { DEFAULT_OT_RANKING } from "../phonology/ot";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";
import { makeRng } from "../rng";
import { cloneLexicon, cloneMorphology } from "../utils/clone";
import { inventoryFromLexicon, seedNativeProvenance } from "./helpers";
import { seedDerivationalSuffixes } from "../lexicon/derivation";
import { rekeyLexiconToConceptIds } from "../lexicon/conceptIdentity";
import { lexGet, lexSet, lexHas, lexKeys } from "../lexicon/access";
import { zipfFrequencyFor } from "../lexicon/concepts";
import { lookupAffixMetaByTag } from "../translator/englishAffixes";
import { DEFAULT_CLASSIFIER_TABLE } from "../translator/classifiers";
import { assignAllGenders } from "../morphology/gender";
import { activeModulesOf } from "../modules/registry";
import { classifyLexicon } from "../morphology/inflectionClass";
import { isToneBearing, toneOf, MID } from "../phonology/tone";
import { addCompound, addDerivation } from "../lexicon/compound";
import { assignAllNounClasses } from "../lexicon/nounClass";
import { buildMorphemeInventory } from "../morphology/morphemeInventory";

/**
 * Phase 39a: count the unique phonemes across a seed lexicon. Used to
 * derive a default `phonemeTarget` when the preset hasn't declared one.
 */
function observedInventorySize(lexicon: import("../types").Lexicon): number {
  const seen = new Set<string>();
  for (const m of Object.keys(lexicon)) {
    const f = lexicon[m];
    if (!f) continue;
    for (const p of f) seen.add(p);
  }
  return seen.size;
}
import { lexicalCapacity as computeCapacity } from "../lexicon/tier";
import { syncWordsFromLexicon } from "../lexicon/word";
import {
  CLOSED_CLASS_LEMMAS,
  closedClassForm,
} from "../translator/closedClass";
import {
  getWorldMap,
  randomLandCell,
  territoryCentroid,
} from "../geo/map";

/**
 * Phase 31 Tranche 31d: one-shot tonalisation. Fills every
 * tone-bearing position in every seed-lexicon word with a tone —
 * keep the existing tone if present (preset-supplied), otherwise
 * default to MID. Called at language birth when the preset declares
 * `seedToneRegime: "tonal"` so the proto starts genuinely tonal
 * instead of partly-tonal.
 */
function tonaliseLexicon(lang: Language): void {
  // Phase 39f: pitch-accent regime marks ONE tone per word (the
  // accented syllable). Tonal regime marks every tone-bearing syllable.
  const isPitchAccent = lang.toneRegime === "pitch-accent";
  for (const m of lexKeys(lang)) {
    const f = lexGet(lang, m)!;
    let needsRewrite = false;
    for (const p of f) {
      if (isToneBearing(p) && !toneOf(p)) { needsRewrite = true; break; }
    }
    if (!needsRewrite) continue;
    if (isPitchAccent) {
      // Mark only the FIRST tone-bearing position with HIGH (accent),
      // leave the rest untoned. Models Japanese/Norwegian.
      let marked = false;
      lexSet(lang, m, f.map((p) => {
        if (!isToneBearing(p)) return p;
        if (toneOf(p)) { marked = true; return p; }
        if (!marked) {
          marked = true;
          return p + "˥"; // HIGH = accent peak
        }
        return p;
      }));
    } else {
      lexSet(lang, m, f.map((p) => {
        if (!isToneBearing(p)) return p;
        if (toneOf(p)) return p;
        return p + MID;
      }));
    }
  }
}

function initialLexicalCapacity(lang: Language): number {
  return computeCapacity(lang, lang.birthGeneration);
}

/**
 * Phase 29 Tranche 5k: pour synthesised closed-class lemmas
 * (the/of/and/i/you/…) into the lexicon at language birth so they
 * evolve through normal phonology. Only fills lemmas that the seed
 * lexicon doesn't already define. Marks them with origin
 * "closed-class" and high frequency so the rate-curve treats them
 * as function words (faster erosion than content words).
 */
function seedClosedClassLexicon(lang: Language): void {
  for (const lemma of CLOSED_CLASS_LEMMAS) {
    if (lemma === "Q" || lemma === "CLF") continue;
    if (lexHas(lang, lemma)) continue;
    const form = closedClassForm(lang, lemma);
    if (!form || form.length === 0) continue;
    lexSet(lang, lemma, form);
    if (!lang.wordOrigin[lemma]) lang.wordOrigin[lemma] = "closed-class";
    if (lang.wordFrequencyHints[lemma] === undefined) {
      lang.wordFrequencyHints[lemma] = 0.95;
    }
  }
}

function cloneSuppletion(
  s: NonNullable<Language["suppletion"]>,
): NonNullable<Language["suppletion"]> {
  const out: NonNullable<Language["suppletion"]> = {};
  for (const m of Object.keys(s)) {
    const slots = s[m];
    if (!slots) continue;
    const cloned: NonNullable<Language["suppletion"]>[string] = {};
    for (const cat of Object.keys(slots) as Array<keyof typeof slots>) {
      const f = slots[cat];
      if (f && f.length > 0) cloned[cat] = f.slice();
    }
    out[m] = cloned;
  }
  return out;
}

function seedRegister(
  lex: import("../types").Lexicon,
  rng: import("../rng").Rng,
): Record<string, "high" | "low"> {
  const out: Record<string, "high" | "low"> = {};
  // `lex` is the gloss-keyed seed lexicon (pre-flip); sort its glosses for the
  // canonical RNG-draw order. (The store flips to ConceptId keys immediately
  // after this proto is built; here it is still gloss-keyed.)
  for (const m of Object.keys(lex).sort()) {
    if (rng.chance(0.15)) {
      out[m] = rng.chance(0.5) ? "high" : "low";
    }
  }
  return out;
}

export function buildInitialState(config: SimulationConfig): SimulationState {
  const rng = makeRng(config.seed);
  const rootId = "L-0";
  const enabled = config.phonology.enabledChangeIds.slice().sort();
  // Phase 58.7: per-seed sound-change weight jitter. Each enabled
  // rule gets a multiplier in [0.5, 1.5] derived from a sub-RNG
  // seeded by `${config.seed}:weight:${ruleId}` — independent per
  // rule so adding/removing one rule from the enabled set doesn't
  // shift the multipliers of unrelated rules. Different simulation
  // seeds therefore produce different "phonological tempos": some
  // seeds amplify lenition, others amplify deletion, others slow
  // delabialisation. Models real language-family variation in
  // which sound changes dominate. Uses dedicated sub-RNGs so the
  // main step-RNG sequence is unaffected.
  const weights: Record<string, number> = {};
  for (const id of enabled) {
    const base = config.phonology.changeWeights[id] ?? CATALOG_BY_ID[id]?.baseWeight ?? 1;
    // Phase 40d: preset-level rule-weight priors. Multiplicative on
    // top of the catalog/config base weight. Soft prior, not cap.
    const priorMult = config.seedRuleBias?.[id] ?? 1;
    const jitterRng = makeRng(`${config.seed}:weight:${id}`);
    const jitterMult = 0.5 + jitterRng.next();
    weights[id] = base * priorMult * jitterMult;
  }
  const seedLex = cloneLexicon(config.seedLexicon);
  const rootLang: Language = {
    id: rootId,
    name: "Proto",
    lexicon: seedLex,
    enabledChangeIds: enabled,
    changeWeights: weights,
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR, ...(config.seedGrammar ?? {}) },
    events: [],
    wordFrequencyHints: { ...(config.seedFrequencyHints ?? {}) },
    phonemeInventory: inventoryFromLexicon(seedLex),
    morphology: cloneMorphology(config.seedMorphology),
    localNeighbors: {},
    conservatism: 1.0,
    speakers: 10000,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    ruleBias: { ...DEFAULT_RULE_BIAS },
    registerOf: seedRegister(seedLex, rng),
    // Phase 72b T2: per-preset closed-class anchor list. Inherited at
    // split (split.ts:cloneClosedClassInventory). Undefined falls back
    // to the universal default in apply.ts.
    closedClassInventory: config.seedClosedClassInventory,
    coords: { x: 0, y: 0 },
    orthography: {},
    otRanking: DEFAULT_OT_RANKING.slice(),
    lastChangeGeneration: {},
    stressPattern: config.seedStressPattern ?? "penult",
    // Phase 31 Tranche 31d: tonal regime declared by preset; defaults
    // to non-tonal. `refreshInventory` reclassifies each gen so the
    // seed value just sets the proto-language's starting state.
    toneRegime: config.seedToneRegime ?? "non-tonal",
    // Phase 39a: per-language phoneme target. Preset-declared, else
    // seed inventory size, else tier default (28 for tier 1).
    phonemeTarget:
      config.seedPhonemeTarget ??
      (config.seedLexicon ? observedInventorySize(config.seedLexicon) : 28),
    infinitiveStrategy: config.seedInfinitiveStrategy ?? { kind: "bare" },
    // Phase 27a: phonotactic profile defaults to permissive (English-like)
    // when no preset specifies — preserves pre-Phase-27 behavior.
    phonotacticProfile: config.seedPhonotacticProfile ?? {
      maxOnset: 3,
      maxCoda: 4,
      maxCluster: 4,
      strictness: 0.4,
    },
    lexicalStress: config.seedLexicalStress
      ? { ...config.seedLexicalStress }
      : undefined,
    culturalTier: config.seedCulturalTier ?? 0,
    suppletion: config.seedSuppletion
      ? cloneSuppletion(config.seedSuppletion)
      : undefined,
  };
  // Concept re-key (R2 — the flip): the preset authors gloss -> form, so the
  // literal above leaves rootLang.lexicon gloss-keyed. Flip it to the canonical
  // ConceptId-keyed store NOW, before any accessor-driven setup runs
  // (seedDerivationalSuffixes, seedClosedClassLexicon, tonaliseLexicon, …),
  // which all assume conceptIds is populated. Mints in preset insertion order,
  // so the downstream lexKeys gloss sequence is byte-identical.
  rekeyLexiconToConceptIds(rootLang);
  // Phase 6a: give EVERY content concept a Zipfian-by-rank seed frequency (by
  // concept tier), not just the ~89 in seedFrequencyHints. Without this most
  // words fell back to a flat 0.5 default, so the content/function + Swadesh
  // brakes had no real frequency signal for non-core vocabulary and the
  // distribution couldn't be Zipfian. Explicit seedFrequencyHints (and the
  // closed-class anchors poured in below) keep precedence — this only fills gaps.
  for (const m of lexKeys(rootLang)) {
    if (rootLang.wordFrequencyHints[m] === undefined) {
      rootLang.wordFrequencyHints[m] = zipfFrequencyFor(m);
    }
  }
  rootLang.derivationalSuffixes = seedDerivationalSuffixes(rootLang, rng);
  rootLang.lexicalCapacity = initialLexicalCapacity(rootLang);
  seedNativeProvenance(rootLang);
  // Phase 73e: preset-declared colexifications. Records concepts that share
  // one lexeme in this language (winner → absorbed meanings) on colexifiedAs;
  // the lookup cascade's reverse-colex rung resolves an absorbed meaning to
  // the winner's form. Lets a preset carve its own concept space (e.g. Bantu
  // arm=hand) instead of mirroring the English seed inventory.
  if (config.seedColexification) {
    rootLang.colexifiedAs = {};
    for (const [winner, absorbed] of Object.entries(config.seedColexification)) {
      rootLang.colexifiedAs[winner] = absorbed.slice();
    }
  }
  // MEGA overhaul: seed SYNONYMS / lexical doublets (the inverse of colexification —
  // one meaning carrying several forms). Only attach to meanings the language actually
  // has a primary form for; the alternates then compete in narrative + translation.
  if (config.seedAltForms) {
    rootLang.altForms = rootLang.altForms ?? {};
    for (const [meaning, forms] of Object.entries(config.seedAltForms)) {
      if (!lexHas(rootLang, meaning)) continue;
      const valid = forms.filter((f) => f.length > 0).map((f) => f.slice());
      if (valid.length > 0) rootLang.altForms[meaning] = valid;
    }
  }
  // Phase 70 T1: tag the proto-language so Historical Mode milestones
  // targeting role "proto" find a leaf to nudge. Skipped when
  // Historical Mode is off — leaves the field undefined.
  if (config.historical?.scheduleId) {
    rootLang.historicalRole = "proto";
    rootLang.historicalRoleAssignedGen = 0;
  }
  // Phase 29 Tranche 5k: pour synthesised closed-class lemmas into
  // the lexicon at language birth so they participate in phonology
  // like any other word. Pre-fix the closedClassForm() machinery
  // recomputed forms from a hash on every call, meaning function
  // words like "the" / "of" / "and" / "i" / "you" never eroded —
  // contradicting Phase 24's whole frequency-direction premise that
  // function words should erode FASTEST. (closedClassTable still
  // synthesises for any lemma we haven't seeded; pre-existing
  // analogy + drift gates already exclude these meanings, so they
  // erode but don't reshape.)
  seedClosedClassLexicon(rootLang);
  // Phase 31 Tranche 31d: if the preset declares the language tonal,
  // run a one-shot tonalisation pass that fills every tone-bearing
  // position in every seed-lexicon word with a default tone (MID).
  // This makes the proto-language fully tonal at gen 0 instead of
  // relying on per-word tonogenesis to slowly cover the lexicon
  // (which left languages in inconsistent partial-tonal states).
  if (rootLang.toneRegime === "tonal") {
    tonaliseLexicon(rootLang);
  }
  // Phase 34 Tranche 34g: register preset-declared compounds so the
  // simulator tracks their structure. The initial surface form is
  // recomposed from the parts at language birth; subsequent gens
  // recompose each tick until fossilisation.
  if (config.seedCompounds) {
    for (const [meaning, def] of Object.entries(config.seedCompounds)) {
      addCompound(rootLang, meaning, def.parts, 0, { linker: def.linker });
    }
  }
  // Meaning-layer Stage A1: preset-declared derivations (word = base + affix).
  if (config.seedDerivations) {
    for (const [meaning, def] of Object.entries(config.seedDerivations)) {
      addDerivation(rootLang, meaning, def.base, def.affix, 0, { position: def.position });
    }
  }
  // Track C (preset morphemization): preset-declared ETYMOLOGIES — a previously-atomic word's
  // morphological ancestry, recorded in an engine-INERT field (lang.etymology) that ONLY the
  // Dictionary / Track B composition accessors read. Nothing in sim.step consumes it, so it is
  // determinism-neutral — unlike lang.compounds, whose "has recorded parts" status changes
  // derivation / taboo / obsolescence / neighbour-bootstrap behaviour and would re-baseline the
  // preset. The word and all parts must be in seedLexicon; skipped when the meaning already has a
  // real compound/derivation (recordedParts wins in wordMorphemes).
  if (config.seedEtymologies) {
    for (const [meaning, def] of Object.entries(config.seedEtymologies)) {
      if (rootLang.compounds?.[meaning]) continue; // a real compound/derivation takes precedence
      if (!lexHas(rootLang, meaning)) continue; // need an existing word to attribute ancestry to
      if (!def.parts.every((p) => lexHas(rootLang, p))) continue; // parts must be lexicalised
      if (!rootLang.etymology) rootLang.etymology = {};
      rootLang.etymology[meaning] = def.parts.slice();
    }
  }
  // Phase 36 Tranche 36f: register bound morphemes so they're
  // skipped in standalone-form contexts but still flow through
  // phonological evolution.
  if (config.seedBoundMorphemes && config.seedBoundMorphemes.size > 0) {
    rootLang.boundMorphemes = new Set(config.seedBoundMorphemes);
    rootLang.boundMorphemeOrigin = {};
    if (!rootLang.derivationalSuffixes) rootLang.derivationalSuffixes = [];
    for (const m of config.seedBoundMorphemes) {
      rootLang.boundMorphemeOrigin[m] = {
        introducedGen: 0,
        pathway: "preset-seed",
      };
      // Phase 36 Tranche 36t: register seeded bound morphemes as
      // derivational suffix candidates so the genesis loop can pick
      // them up for productive coinage. usageCount starts above
      // threshold for preset-seeded morphemes — they're already
      // productive at language birth.
      //
      // Phase 49: when a tag with the same name already exists (e.g.
      // `seedDerivationalSuffixes` randomly picked "-dom" first), the
      // seeded entry takes precedence — the preset has the canonical
      // phoneme form for the affix, and seed bound morphemes are
      // explicitly productive at gen 0. Pre-49 the duplicate was
      // silently skipped, leaving "-dom" with random phonemes and
      // productive=false — the user-reported "waterdom doesn't work"
      // bug stemmed from exactly this collision.
      const affix = lexGet(rootLang, m);
      if (affix && affix.length > 0) {
        // Phase 47 T2: detect position from tag shape. Tags ending
        // with "-" (e.g. "re-", "un-") are prefixes; otherwise default
        // to suffix (e.g. "-er.agt", "-ness"). Synthesis path uses
        // this to choose concatenation order.
        const meta = lookupAffixMetaByTag(m);
        const position: "prefix" | "suffix" =
          meta?.position
          ?? (m.endsWith("-") && !m.startsWith("-") ? "prefix" : "suffix");
        const existingIdx =
          rootLang.derivationalSuffixes.findIndex((s) => s.tag === m);
        const entry = {
          affix: affix.slice(),
          tag: m,
          position,
          ...(meta?.category ? { category: meta.category } : {}),
          usageCount: 5,
          productive: true,
        };
        if (existingIdx >= 0) {
          rootLang.derivationalSuffixes[existingIdx] = entry;
        } else {
          rootLang.derivationalSuffixes.push(entry);
        }
      }
    }
  }
  // Phase 36 Tranche 36b: Bantu-style noun-class assignment. Each
  // noun in the lexicon gets a class slot used by realise.ts to
  // inflect with the matching class prefix.
  if (config.seedNounClassSystem) {
    assignAllNounClasses(rootLang);
  }
  // Phase 36 Tranche 36o: opt the proto language into a sandhi family
  // subset. Filters which tone-sandhi rules fire in stepToneSandhi.
  if (config.seedToneSandhiRules && config.seedToneSandhiRules.length > 0) {
    rootLang.toneSandhiRules = config.seedToneSandhiRules.slice();
  }
  // Phase 41b: module activation. When the preset declares an active
  // module set, allocate the per-language state record and run each
  // module's initState in topological order (requires-first). Modules
  // not in the set are skipped entirely throughout this language's
  // lifetime — that's where the perf win comes from.
  if (config.seedActiveModules && config.seedActiveModules.length > 0) {
    rootLang.activeModules = new Set(config.seedActiveModules);
    rootLang.moduleState = {};
    const initCtx = { generation: 0, rng, config };
    for (const m of activeModulesOf(rootLang)) {
      // Phase 46c: lazy state — stateless modules (no initState)
      // don't get a slot allocated. Saves the empty-object overhead.
      if (m.initState) {
        rootLang.moduleState[m.id] = m.initState(rootLang, initCtx);
      }
    }
  }
  assignAllGenders(rootLang);
  // Phase 64 T3: when the language is seeded with a classifier
  // system but no table, generate distinct one-syllable classifier
  // forms (CV) for each semantic class. Direct phoneme forms are
  // used so we don't depend on the lexicon containing meanings like
  // "person" / "creature" / "round-thing" — many presets don't have
  // those.
  if (rootLang.grammar.classifierSystem && !rootLang.grammar.classifierTable) {
    const classes = Object.keys(DEFAULT_CLASSIFIER_TABLE);
    // Pull consonants + vowels available in the inventory.
    const inv = rootLang.phonemeInventory.segmental;
    const cons = inv.filter((p) => !"aeiouɛɔəɪʊæɑøœɯyɨ".includes(p));
    const vows = inv.filter((p) => "aeiouɛɔəɪʊæɑøœɯyɨ".includes(p));
    const safeC = cons.length > 0 ? cons : ["k", "p", "t", "m", "n"];
    const safeV = vows.length > 0 ? vows : ["a", "i", "u", "e", "o"];
    const table: Record<string, string | import("../types").Phoneme[]> = {};
    let cIdx = 0;
    let vIdx = 0;
    for (const cls of classes) {
      const c = safeC[cIdx % safeC.length]!;
      const v = safeV[vIdx % safeV.length]!;
      table[cls] = [c, v];
      cIdx++;
      if (cIdx % safeC.length === 0) vIdx++;
    }
    rootLang.grammar.classifierTable = table;
  }
  // Phase 29 Tranche 5e: bucket every seed meaning into an inflection
  // class (Latin-style 1/2/3/4) biased by phonological shape. The
  // class is stable across the language's lifetime and consulted by
  // paradigm-pickers for class-specific affixes.
  classifyLexicon(rootLang, rng);
  // Phase 21a: build the form-centric `words` table from the seed
  // lexicon so day-zero languages already have the new layer populated.
  // No behavior change: `lexicon` remains the source of truth until
  // 21b+ wire writers through `addWord`/`removeSense`.
  syncWordsFromLexicon(rootLang, 0);
  // Lane D (morphology encoding): build the first-class morpheme inventory
  // from the now-populated lexicon + the recorded compound / derivation /
  // bound-morpheme structure. Runs AFTER syncWordsFromLexicon so the
  // seed-time morphStructure has landed on the Words and the lexicon forms
  // are final. Daughters inherit a clone at split (tree/split.ts) and can
  // rebuild from their own records.
  rootLang.morphemeInventory = buildMorphemeInventory(rootLang);
  const mapMode = config.mapMode ?? "random";
  const worldMap = getWorldMap(mapMode, config.seed);
  let originId: number | null =
    config.originCellId !== undefined && worldMap.cells[config.originCellId]
      ? config.originCellId
      : null;
  if (originId === null) {
    // Phase 58.8: removed preset-specific Earth-origin lookup
    // (suggestedEarthOrigin keyed on config.preset → hardcoded
    // PIE-in-Anatolia, Bantu-in-central-Africa, etc.). Each preset
    // now lands on a random land cell in earth mode, same as random
    // mode. The historical-mode rollout will reinstate per-preset
    // origins as an opt-in, not a default.
    originId = randomLandCell(worldMap, rng);
  }
  if (originId !== null && worldMap.cells[originId]) {
    rootLang.territory = { cells: [originId] };
    rootLang.coords = territoryCentroid(worldMap, [originId]);
  }
  // Phase 72d / R2: stable ConceptIds were assigned at the gloss->cid flip
  // above (rekeyLexiconToConceptIds), which also keys the canonical store by
  // them. Daughters inherit conceptIds at split; identity persists across
  // phonological / semantic drift.
  const rootNode: LanguageNode = {
    language: rootLang,
    parentId: null,
    childrenIds: [],
  };
  const tree: LanguageTree = { [rootId]: rootNode };
  return {
    generation: 0,
    tree,
    rootId,
    rngState: rng.state(),
  };
}
