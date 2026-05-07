import type { Lexicon, Meaning, SoundChange, SoundChangeCategory, WordForm } from "../types";
import type { Rng } from "../rng";
import { soundChangeSensitivity } from "../lexicon/expressive";
// Phase 26e: corenessResistance import removed. Swadesh-membership-based
// rate dampening was redundant with Phase 24c's frequency-direction split
// (high-freq content words get conservative-when-frequent treatment via
// freqInput = 1 - freq), and not accurate to real etymology — Swadesh
// words DO drift in real languages (PIE *ph₂tér → English father, Sanskrit
// pitár, Latin pater). Removing the modifier lets Swadesh content words
// participate in the same frequency-based dynamics as ordinary content.
import { isFormLegal, repairSyllabicity } from "./wordShape";
import { stressClass, type StressPattern } from "./stress";
import { isVowel } from "./ipa";
import { stripTone } from "./tone";
import { posOf } from "../lexicon/pos";
import { otFit } from "./ot";
import { wouldCreateUnrelatedHomonym } from "../lexicon/homonyms";
import { markednessDelta } from "./markedness";
import type { Language } from "../types";

/**
 * Phase 24: rule categories that net-shrink or weaken a word. Soft
 * erosion resistance dampens the firing rate of rules in this set as
 * the word approaches its floor length. Non-erosive categories (vowel
 * shifts, palatalisation, fortition, insertion, voicing, assimilation,
 * metathesis) fire at full rate regardless of word length.
 */
const EROSIVE_CATEGORIES: ReadonlySet<SoundChangeCategory> = new Set<SoundChangeCategory>([
  "lenition",
  "deletion",
  "gemination",
  // Phase 29 Tranche 3a: stress-conditioned apocope / syncope (formerly
  // tagged "deletion") and compensatory mergers (former "deletion") are
  // also net-erosive in length terms. Include them so the soft floor
  // applies symmetrically.
  "stress",
  "compensatory",
]);

const ABSOLUTE_FLOOR_LEN = 2;

/**
 * Phase 36 Tranche 36g: global slowdown. Multiplies every rule's
 * lambda. Pre-36g the simulator showed 3-5 strata of sound change in
 * 100 generations — too fast relative to attested diachrony where a
 * single complete shift takes ~40-100 sim-gens (assuming 10y/gen).
 * 0.4 is calibrated against the audit baseline; tune at this knob
 * rather than per-rule.
 */
// Phase 39b: dropped 0.4 → 0.25. Real diachrony is more
// lexical-replacement-dominated than sound-change-dominated. Phase
// 38g already cut the rate; 39b cuts it further to balance against
// the now-tripled synonym genesis rate (steps/grammar.ts).
const GENERATION_RATE_SCALE = 0.25;

/**
 * Phase 36 Tranche 36g: per-rule frequency-tier multiplier.
 * Common changes (lenitions, vowel reductions, palatalisation) fire
 * 1.5× ordinary; rare changes (metathesis, marked fortition,
 * dissimilation) fire 0.4×. Default ordinary.
 */
const FREQUENCY_MULT: Record<NonNullable<SoundChange["frequency"]>, number> = {
  common: 1.5,
  ordinary: 1.0,
  rare: 0.4,
};

/**
 * Phase 24: smooth erosion-resistance curve, gated by a per-seed floor.
 * Returns 1.0 at full seed length (no resistance — rule fires at full
 * rate) and decays toward 0 as the word approaches `seedFloor`, where
 * `seedFloor = max(ABSOLUTE_FLOOR_LEN, ceil(seedLen * 0.7))`. Beyond
 * `seedFloor`, returns 0 (no further erosion).
 *
 * The 0.7 ratio matches Phase 23b's hard cap, but the resistance is now
 * a smooth probability scaling rather than an after-the-fact reject. A
 * 5-phoneme word can drift to 4 (~50% rate) but rarely below; a
 * 4-phoneme word drifts to 3; a 3-phoneme word drifts to 2; a 2-phoneme
 * word never erodes (returns 1, but the rule's own length checks
 * prevent below-2 outcomes via isFormLegal).
 */
export function erosionResistance(
  category: SoundChangeCategory,
  currentLen: number,
  seedLen: number,
  freq?: number,
): number {
  if (!EROSIVE_CATEGORIES.has(category)) return 1;
  // Phase 39g: high-frequency function words can erode below the
  // global ABSOLUTE_FLOOR_LEN. Real reduction: "going to" → "gonna",
  // "of" → /əv/ → /ə/. When freq ≥ 0.85 and the form is already 2
  // phonemes, allow further erosion at half rate.
  const effectiveFloor = freq !== undefined && freq >= 0.85 ? 1 : ABSOLUTE_FLOOR_LEN;
  if (seedLen <= effectiveFloor) return freq !== undefined && freq >= 0.85 ? 0.5 : 1;
  const seedFloor = Math.max(effectiveFloor, Math.ceil(seedLen * 0.7));
  const range = seedLen - seedFloor;
  if (range <= 0) return 1; // pathological: floor equals seed (e.g., seedLen=3 → floor=3)
  if (currentLen <= seedFloor) return 0;
  const slack = currentLen - seedFloor;
  return Math.min(1, Math.pow(slack / range, 1.5));
}

export interface ApplyOptions {
  globalRate: number;
  weights: Record<string, number>;
  rateMultiplier?: number;
  frequencyHints?: Record<Meaning, number>;
  agesSinceChange?: Record<Meaning, number>;
  registerOf?: Record<Meaning, "high" | "low">;
  stressPattern?: StressPattern;
  lexicalStress?: Record<Meaning, number>;
  /**
   * Phase 24: per-meaning seed length, used by the soft erosion-
   * resistance curve. When provided, deletion/lenition/gemination rules
   * have their firing probability scaled down as the current word
   * length approaches the SOFT_FLOOR_LEN (2). Without it, full rate
   * applies. Replaces Phase 23b's `minLengthFor` hard cap.
   */
  seedLengths?: Record<Meaning, number>;
  /**
   * Phase 28d: per-meaning neighbour-momentum boost in [1, 1.5].
   * Computed by the caller as the fraction of a meaning's local
   * neighbours that changed in the last ~20 generations, scaled to
   * 1 + 0.5×fraction. Multiplied into lambda so a word whose
   * semantic neighbours are actively diffusing a sound change
   * adopts it faster — the S-curve of lexical diffusion.
   */
  neighbourMomentum?: Record<Meaning, number>;
  /**
   * Phase 29 Tranche 5c: lexical diffusion S-curve. Tracks when each
   * rule first actuated in this language. The Wang sigmoid uses
   * (currentGeneration - actuatedAt) as the time variable, so a
   * newly-actuated rule fires at a damped rate that ramps up over
   * dozens of generations rather than instantly hitting full rate.
   * Per-meaning frequency tilts the threshold: high-freq content
   * words flip late (large t0), low-freq early.
   *
   * Both fields must be present for the S-curve to apply; missing
   * either yields a multiplier of 1 (no effect, back-compat).
   */
  ruleActuationGen?: Record<string, number>;
  currentGeneration?: number;
  /**
   * Phase 29 Tranche 5o: pass the language's OT ranking so candidate
   * outputs can be scored against the constraint hierarchy. When a
   * change worsens otFit by more than `OT_REJECT_THRESHOLD`, reject
   * with probability proportional to the worsening. Implements the
   * "soft penalty" wiring the plan called for, so the OT module
   * isn't dead-on-arrival.
   *
   * Without `langForOt` the OT filter is skipped (back-compat). The
   * caller (steps/phonology.ts) supplies `lang` here.
   */
  langForOt?: Pick<Language, "otRanking">;
  /**
   * Phase 48 T3: pass the language for homonym-avoidance lookups.
   * When provided, candidate forms are checked against
   * `lang.wordsByFormKey` for collisions with unrelated words; if a
   * collision is detected, the rule application is inhibited with
   * probability `INHIBIT_PROB` (default 0.7, override via
   * `lang.homonymInhibition`). Without `langForHomonym` the check is
   * skipped (back-compat).
   *
   * Linguistic basis: Martinet 1952 / Wedel et al. 2013 — speakers
   * resist actuating word-specific changes that would create
   * homonyms with unrelated words.
   */
  langForHomonym?: Language;
  /**
   * Phase 48 T3: feature flag for back-compat replay determinism.
   * Defaults to `true` when omitted; pass `false` to disable the
   * homonym-avoidance hook (e.g., for replay of pre-Phase-48 saves).
   */
  homonymAvoidance?: boolean;
  /**
   * Phase 48 D4-B: feature flag for the markedness-asymmetry hook.
   * Defaults to `true`. Set false for back-compat replay.
   */
  markednessBias?: boolean;
  _orderedChanges?: SoundChange[];
}

const OT_REJECT_THRESHOLD = 0.05;
const OT_REJECT_GAIN = 1.5;

function hasStressFilterMatch(
  word: WordForm,
  filter: NonNullable<SoundChange["stressFilter"]>,
  pattern: StressPattern | undefined,
  lexicalIdx: number | undefined,
): boolean {
  if (filter === "any") return true;
  for (let i = 0; i < word.length; i++) {
    if (!isVowel(stripTone(word[i]!))) continue;
    if (stressClass(word, i, pattern, lexicalIdx) === filter) return true;
  }
  return false;
}

function ageBoost(age: number | undefined): number {
  if (age === undefined || age < 0) return 1;
  return 1 + 0.4 * Math.exp(-age / 3);
}

const DEFAULT_FREQUENCY = 0.5;

const CATEGORY_PRIORITY: Record<SoundChange["category"], number> = {
  vowel: 2.2,
  lenition: 2.0,
  voicing: 1.8,
  palatalization: 1.6,
  harmony: 1.5,
  umlaut: 1.5,
  assimilation: 1.4,
  monophthongization: 1.3,
  deletion: 1.2,
  compensatory: 1.2,
  stress: 1.2,
  insertion: 1.0,
  tonogenesis: 1.0,
  detonogenesis: 0.95,
  metathesis: 0.9,
  gemination: 0.8,
  glottalization: 0.7,
  retroflex: 0.6,
  devoicing: 0.6,
  inventory: 0.55,
  fortition: 0.5,
};

/**
 * Phase 28c: directionality bias — multiplies rule firing probability
 * to reflect cross-linguistic asymmetries. Lenition, voicing
 * assimilation, and palatalisation are common natural processes;
 * fortition (hardening) and metathesis are typologically marked.
 *
 * Pre-28c the catalog gave these categories near-equal weights, so
 * fortition fired about as often as lenition — unrealistic. The bias
 * applies uniformly across all rules in a category at lambda
 * computation time, leaving the existing CATEGORY_PRIORITY (which
 * controls ORDER, not LIKELIHOOD) intact.
 */
const CATEGORY_NATURAL_BIAS: Record<SoundChange["category"], number> = {
  lenition: 1.5,
  assimilation: 1.5,
  palatalization: 1.5,
  harmony: 1.4,
  umlaut: 1.4,
  voicing: 1.2,
  monophthongization: 1.1,
  compensatory: 1.1,
  stress: 1.0,
  deletion: 1.0,
  insertion: 1.0,
  vowel: 1.0,
  gemination: 1.0,
  tonogenesis: 1.0,
  detonogenesis: 0.9,
  glottalization: 0.85,
  devoicing: 0.85,
  metathesis: 0.6,
  retroflex: 0.55,
  fortition: 0.5,
  inventory: 0.4,
};

function priorityFor(change: SoundChange): number {
  if (typeof change.priority === "number") return change.priority;
  return CATEGORY_PRIORITY[change.category] ?? 1.0;
}

const SORTED_CACHE = new WeakMap<SoundChange[], SoundChange[]>();

export function sortByPriority(changes: SoundChange[]): SoundChange[] {
  const cached = SORTED_CACHE.get(changes);
  if (cached) return cached;
  const out = changes.slice().sort((a, b) => priorityFor(b) - priorityFor(a));
  SORTED_CACHE.set(changes, out);
  return out;
}

function frequencyFor(meaning: Meaning, hints?: Record<Meaning, number>): number {
  if (!hints) return DEFAULT_FREQUENCY;
  const v = hints[meaning];
  return typeof v === "number" ? Math.max(0, Math.min(1, v)) : DEFAULT_FREQUENCY;
}

/**
 * Phase 24: predicate matching real-linguistic content-vs-function
 * frequency-effect bifurcation. Content words (noun, verb, adj) get the
 * conservative-when-frequent treatment (real example: PIE *méh₂tēr stays
 * close to English "mother"). Function words (DET, AUX, PREP, CONJ) keep
 * the erosion-when-frequent direction (real example: "going to" → "gonna").
 */
function isContentWord(meaning: Meaning): boolean {
  const pos = posOf(meaning);
  return pos === "noun" || pos === "verb" || pos === "adjective";
}

/**
 * Phase 38d: Swadesh-100 core anchor list. Used to apply a hard
 * brake on phonological drift for the most stable cross-linguistic
 * meanings. Inlined to avoid a circular import with semantics/lexicostat.
 */
const SWADESH_CORE_SET: ReadonlySet<string> = new Set([
  "i", "you", "we", "this", "that", "who", "what", "not", "all", "many",
  "one", "two", "big", "long", "small", "woman", "man", "person", "fish",
  "bird", "dog", "louse", "tree", "seed", "leaf", "root", "bark", "skin",
  "flesh", "blood", "bone", "grease", "egg", "horn", "tail", "feather",
  "hair", "head", "ear", "eye", "nose", "mouth", "tooth", "tongue", "claw",
  "foot", "knee", "hand", "belly", "neck", "breast", "heart", "liver",
  "drink", "eat", "bite", "see", "hear", "know", "sleep", "die", "kill",
  "swim", "fly", "walk", "come", "lie", "sit", "stand", "give", "say",
  "sun", "moon", "star", "water", "rain", "stone", "sand", "earth", "cloud",
  "smoke", "fire", "ash", "burn", "path", "mountain", "red", "green", "yellow",
  "white", "black", "night", "hot", "cold", "full", "new", "good", "round",
  "dry", "name",
]);

export function applyChangesToWord(
  word: WordForm,
  changes: SoundChange[],
  rng: Rng,
  opts: ApplyOptions,
  meaning: Meaning = "",
): WordForm {
  const mult = opts.rateMultiplier ?? 1;
  const freq = frequencyFor(meaning, opts.frequencyHints);
  const register = opts.registerOf?.[meaning];
  const registerShift = register === "high" ? -0.15 : register === "low" ? 0.05 : 0;
  // Phase 24: split the frequency-effect direction by part of speech.
  // Content words: high-freq → conservative (smaller effective freq input
  // to the exponent → larger exponent → smaller adjusted probability).
  // Function words: keep the existing direction (high-freq → erosion).
  const freqInput = isContentWord(meaning)
    ? Math.max(0.05, Math.min(1, 1 - freq + registerShift))
    : Math.max(0.05, Math.min(1, freq + registerShift));
  let freqExponent = 0.4 + freqInput * 1.2;
  // Phase 38d: Swadesh-core hard brake. Meanings on the Swadesh-100
  // list with freq ≥ 0.85 get an additional 0.4× exponent multiplier,
  // bringing their effective drift rate to ~0.1-0.3%/gen — matching
  // real Swadesh retention of 85%/millennium.
  if (freq >= 0.85 && SWADESH_CORE_SET.has(meaning)) {
    freqExponent *= 0.4;
  }
  // Phase 38d: low-freq content boost. Real low-freq vocabulary
  // churns faster than the smooth curve predicts (rare technical
  // terms, hapax legomena). Boost by 20% when freq ≤ 0.25 and
  // content word.
  let lowFreqBoost = 1;
  if (freq <= 0.25 && isContentWord(meaning)) {
    lowFreqBoost = 1.2;
  }
  const age = opts.agesSinceChange?.[meaning];
  const ageMult = ageBoost(age);
  // Phase 26e: removed coreMult = corenessResistance(meaning). See header
  // comment for rationale.
  const seedLen = opts.seedLengths?.[meaning] ?? word.length;

  let current = word;
  const lexicalIdx = opts.lexicalStress?.[meaning];
  const ordered = opts._orderedChanges ?? sortByPriority(changes);
  for (const change of ordered) {
    const weight = opts.weights[change.id] ?? change.baseWeight;
    if (weight <= 0) continue;
    if (change.stressFilter && change.stressFilter !== "any") {
      if (!hasStressFilterMatch(current, change.stressFilter, opts.stressPattern, lexicalIdx)) {
        continue;
      }
    }
    const base = change.probabilityFor(current);
    if (base <= 0) continue;

    const adjusted = Math.pow(base, 1 / Math.max(0.01, freqExponent));
    const lenFactor = Math.min(1, Math.max(0.25, (current.length - 1) / 4));
    // Phase 24: soft erosion resistance — fades probability of erosive
    // rules to zero as currentLen approaches SOFT_FLOOR_LEN (=2). Vowel
    // shifts, palatalisation, fortition, insertion etc. are unaffected.
    const resistance = erosionResistance(change.category, current.length, seedLen, freq);
    // Phase 28c: directionality bias (natural processes ×1.2-1.5,
    // marked processes ×0.5-0.6).
    // Phase 39g: per-language natural-bias override allows some
    // languages to develop unusual category preferences (e.g., a
    // fortition-loving Caucasian-style language). The override
    // multiplies the global bias rather than replacing it; drifts
    // ±0.02 per category per gen via stepPhonology.
    const baseBias = CATEGORY_NATURAL_BIAS[change.category] ?? 1.0;
    const langOverride = (opts.langForOt as Language | undefined)
      ?.naturalBiasOverride?.[change.category];
    const naturalBias = baseBias * (langOverride ?? 1.0);
    // Phase 28d: lexical-diffusion S-curve. When this meaning's
    // semantic neighbours have recently undergone change, the rule's
    // probability boosts here too — modeling how sound changes spread
    // word-by-word rather than firing exceptionlessly across the
    // whole lexicon. Caller passes `neighbourMomentum` ∈ [1, 1.5].
    const momentum = opts.neighbourMomentum?.[meaning] ?? 1;
    // Phase 29 Tranche 5c: Wang lexical-diffusion S-curve. The rule's
    // age in this language drives a sigmoid that ramps from a damped
    // initial rate to full rate over generations. Per-meaning
    // frequency tilts the threshold: high-freq content words have a
    // larger t0 (resist longer); low-freq words have a smaller t0.
    // Without ruleActuationGen / currentGeneration in opts, multiplier
    // is 1 (back-compat).
    let wangBoost = 1;
    if (opts.ruleActuationGen && opts.currentGeneration !== undefined) {
      const actuatedAt = opts.ruleActuationGen[change.id];
      if (actuatedAt !== undefined) {
        const age = opts.currentGeneration - actuatedAt;
        // freq-tilted threshold: high-freq content words get pushed
        // further out (t0 ≈ 50–100 gens); low-freq early adopters
        // (t0 ≈ 5–15 gens). Function words (Phase 24c flips direction)
        // adopt fast regardless.
        const t0 = isContentWord(meaning) ? 10 + (1 - freq) * -60 + 60 : 5;
        const k = 0.15;
        wangBoost = 1 / (1 + Math.exp(-k * (age - t0)));
      }
    }
    const freqTier = FREQUENCY_MULT[change.frequency ?? "ordinary"];
    // Phase 38e: per-category rule-level momentum. When a sister
    // rule in the same category has actuated recently, this rule
    // gets a boost — modelling chain-shift clusters (Grimm's Law,
    // Great Vowel Shift). Decays to 1 after `until` gen.
    let catMomentum = 1;
    if (opts.langForOt && opts.currentGeneration !== undefined) {
      const cm = (opts.langForOt as Language).categoryMomentum?.[change.category];
      if (cm && opts.currentGeneration < cm.until) {
        catMomentum = cm.boost;
      }
    }
    const lambda = Math.min(
      3,
      adjusted *
        weight *
        naturalBias *
        freqTier *
        lowFreqBoost *
        catMomentum *
        momentum *
        wangBoost *
        opts.globalRate *
        mult *
        ageMult *
        GENERATION_RATE_SCALE *
        // Phase 26e: removed coreMult — see header comment.
        lenFactor *
        resistance,
    );

    const hits = samplePoissonBounded(lambda, rng);
    for (let i = 0; i < hits; i++) {
      const next = change.apply(current, rng);
      if (next === current) break;
      if (!isFormLegal(meaning, next)) break;
      // Phase 48 T3: homonym-avoidance hook. When the language has
      // `wordsByFormKey` populated and the candidate would collide
      // with another (unrelated) word's form, inhibit the rule
      // application with probability `INHIBIT_PROB`. Hidden behind
      // `opts.homonymAvoidance` so replay of pre-Phase-48 saves is
      // deterministic.
      if (
        (opts.homonymAvoidance ?? true) !== false &&
        opts.langForHomonym &&
        meaning &&
        wouldCreateUnrelatedHomonym(opts.langForHomonym, meaning, next)
      ) {
        const inhibitP =
          opts.langForHomonym.homonymInhibition ?? HOMONYM_INHIBIT_PROB_DEFAULT;
        if (rng.chance(inhibitP)) {
          opts.langForHomonym.homonymInhibitions =
            (opts.langForHomonym.homonymInhibitions ?? 0) + 1;
          break;
        }
      }
      // Phase 48 D4-B: markedness asymmetry. Sound changes that
      // INTRODUCE marked segments (e.g., produce ʔ, ɸ, ɮ, click
      // consonants, implosives) are probabilistically inhibited;
      // changes that REMOVE marked segments are not. Linguistic
      // basis: Greenberg 1966; Jakobson 1941; Maddieson 1984.
      // Marked phonemes are rarer cross-linguistically and more
      // prone to merger / loss diachronically, not introduction.
      // Hidden behind `opts.markednessBias` for replay determinism.
      if ((opts.markednessBias ?? true) !== false) {
        const delta = markednessDelta(current, next);
        if (delta < -MARKEDNESS_DELTA_THRESHOLD) {
          // Negative delta = candidate has more total markedness than
          // current. Reject probabilistically.
          const rejectP = Math.min(0.85, -delta * MARKEDNESS_REJECT_GAIN);
          if (rng.chance(rejectP)) break;
        }
      }
      // Phase 29 Tranche 5o: soft OT filter. Compare candidate vs
      // current under the language's OT ranking; if the candidate is
      // appreciably worse, reject probabilistically. Skip when the
      // language hasn't supplied a ranking (back-compat).
      if (opts.langForOt) {
        const fitBefore = otFit(current, opts.langForOt as Language);
        const fitAfter = otFit(next, opts.langForOt as Language);
        const drop = fitBefore - fitAfter;
        if (drop > OT_REJECT_THRESHOLD) {
          const rejectP = Math.min(0.85, drop * OT_REJECT_GAIN);
          if (rng.chance(rejectP)) break;
        }
      }
      current = next;
    }
  }
  return current;
}

/** Phase 48 T3: default inhibition probability for unrelated-homonym
 *  candidates. Overridable per-language via `lang.homonymInhibition`. */
const HOMONYM_INHIBIT_PROB_DEFAULT = 0.7;

/** Phase 48 D4-B: markedness-delta threshold below which the inhibitor
 *  fires. Small deltas are tolerated (rule introduces a slightly more
 *  marked segment); only sizeable jumps in markedness get rolled back. */
const MARKEDNESS_DELTA_THRESHOLD = 0.15;

/** Phase 48 D4-B: gain on the rejection probability. With this gain
 *  and the threshold, a delta of -0.5 rejects with p≈0.5; -0.85 rejects
 *  with the cap p=0.85. */
const MARKEDNESS_REJECT_GAIN = 1.0;

function samplePoissonBounded(lambda: number, rng: Rng): number {
  if (lambda <= 0) return 0;
  let L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  while (k < 4) {
    p *= rng.next();
    if (p <= L) return k;
    k++;
  }
  return k;
}

export function applyChangesToLexicon(
  lexicon: Lexicon,
  changes: SoundChange[],
  rng: Rng,
  opts: ApplyOptions,
): Lexicon {
  const out: Lexicon = {};
  const meanings = Object.keys(lexicon).sort();
  const optsWithOrder: ApplyOptions = opts._orderedChanges
    ? opts
    : { ...opts, _orderedChanges: sortByPriority(changes) };
  let anyChanged = false;
  for (const m of meanings) {
    const sensitivity = soundChangeSensitivity(m);
    if (sensitivity < 1 && !rng.chance(sensitivity)) {
      out[m] = lexicon[m]!;
      continue;
    }
    const next = applyChangesToWord(lexicon[m]!, changes, rng, optsWithOrder, m);
    if (next.length === 0) continue;
    if (!isFormLegal(m, next)) {
      const repaired = repairSyllabicity(next);
      if (repaired !== next && isFormLegal(m, repaired)) {
        out[m] = repaired;
        anyChanged = true;
        continue;
      }
      out[m] = lexicon[m]!;
      continue;
    }
    if (next !== lexicon[m]) anyChanged = true;
    out[m] = next;
  }

  if (!anyChanged) return out;

  const freq = opts.frequencyHints ?? {};

  // Phase 30 Tranche 30b: high-frequency Swadesh collision protection.
  // Build a set of "core" meanings — content words with freq ≥ 0.85
  // — whose forms must not collide with each other under sound
  // change. The standard collision-revert below reverts the lower-
  // frequency loser, but when both are equally-high-freq core
  // meanings AND both reverted to identical pre-gen forms (a
  // pre-existing partial homophony), the revert no-ops and the
  // collision sticks. This pre-pass forces the LOSER back to the
  // PARENT-PROTOTYPE seed form when both are core, so kinship
  // doublets like mother/father (mama/baba) don't merge into one
  // word over a few hundred generations.
  const CORE_FREQ_THRESHOLD = 0.85;
  const coreMeanings = new Set<string>();
  for (const m of Object.keys(out)) {
    if ((freq[m] ?? 0.5) >= CORE_FREQ_THRESHOLD && isContentWord(m)) {
      coreMeanings.add(m);
    }
  }

  const byForm = new Map<string, string[]>();
  for (const m of Object.keys(out)) {
    const key = out[m]!.join(" ");
    const bucket = byForm.get(key);
    if (bucket) bucket.push(m);
    else byForm.set(key, [m]);
  }
  for (const [, meanings] of byForm) {
    if (meanings.length < 2) continue;
    meanings.sort((a, b) => (freq[b] ?? 0.5) - (freq[a] ?? 0.5));
    // Phase 30 Tranche 30b: if any pair in this collision bucket are
    // BOTH core, the standard revert-to-input is insufficient (they
    // were already colliding before this gen). For any core loser
    // whose pre-gen form equals the winner's post-gen form, perturb
    // the loser's vowel by reverting to the LAST-DIFFERENT
    // checkpoint we have access to: the seed form for that meaning
    // when available via opts.seedLengths is a length-only hint, so
    // here we simply skip this change for the loser (keep its
    // pre-gen form even if it collides — at least we don't push
    // the collision FURTHER). The collision rate degrades naturally
    // as future changes fire on only one of the pair.
    const winner = meanings[0]!;
    for (let i = 1; i < meanings.length; i++) {
      const loser = meanings[i]!;
      const revert = lexicon[loser];
      if (revert && revert.length > 0) {
        out[loser] = revert.slice();
        // Core-vs-core collision: if both are core AND the revert
        // would still equal the winner's post-form, log it. Stays
        // reverted — but the next gen's RNG draws should diverge.
        if (
          coreMeanings.has(loser) &&
          coreMeanings.has(winner) &&
          revert.join(" ") === out[winner]!.join(" ")
        ) {
          // Pre-existing collision (seed homophony or already-merged
          // pair). Nothing to do beyond keeping the revert. Logged
          // implicitly via the merger-event path elsewhere.
        }
      }
    }
  }

  // Phase 30 Tranche 30b: ALSO block forward-leaning collisions —
  // when applyChangesToWord produced a new form for a core meaning
  // that would equal another CORE meaning's CURRENT (input lexicon)
  // form, revert the core loser. This catches the "mother stayed
  // /mama/, father drifted from /baba/ → /mama/" case where the
  // collision-detection by formKey above only sees ONE side as
  // "current" (the sound-change applied in this gen).
  for (const m of Array.from(coreMeanings)) {
    const newForm = out[m];
    if (!newForm || newForm === lexicon[m]) continue; // no change
    const newKey = newForm.join(" ");
    for (const other of coreMeanings) {
      if (other === m) continue;
      const otherCurrent = lexicon[other];
      if (!otherCurrent) continue;
      if (otherCurrent.join(" ") === newKey) {
        // Collision with another core meaning's stable form. Revert
        // this gen's change for `m` to keep the kinship pair
        // distinct. (Frequency-tied: revert the alphabetically-later
        // one for determinism.)
        if (m > other) {
          out[m] = lexicon[m]!.slice();
        }
        break;
      }
    }
  }

  return out;
}
