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
]);

const ABSOLUTE_FLOOR_LEN = 2;

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
): number {
  if (!EROSIVE_CATEGORIES.has(category)) return 1;
  if (seedLen <= ABSOLUTE_FLOOR_LEN) return 1; // 2-phoneme seeds get full rate
  const seedFloor = Math.max(ABSOLUTE_FLOOR_LEN, Math.ceil(seedLen * 0.7));
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
  _orderedChanges?: SoundChange[];
}

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
  assimilation: 1.4,
  deletion: 1.2,
  insertion: 1.0,
  metathesis: 0.9,
  gemination: 0.8,
  fortition: 0.5,
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
  const freqExponent = 0.4 + freqInput * 1.2;
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
    const resistance = erosionResistance(change.category, current.length, seedLen);
    const lambda = Math.min(
      3,
      adjusted *
        weight *
        opts.globalRate *
        mult *
        ageMult *
        // Phase 26e: removed coreMult — see header comment.
        lenFactor *
        resistance,
    );

    const hits = samplePoissonBounded(lambda, rng);
    for (let i = 0; i < hits; i++) {
      const next = change.apply(current, rng);
      if (next === current) break;
      if (!isFormLegal(meaning, next)) break;
      current = next;
    }
  }
  return current;
}

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
    for (let i = 1; i < meanings.length; i++) {
      const loser = meanings[i]!;
      const revert = lexicon[loser];
      if (revert && revert.length > 0) {
        out[loser] = revert.slice();
      }
    }
  }
  return out;
}
