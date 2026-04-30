import type { Lexicon, Meaning, SoundChange, WordForm } from "../types";
import type { Rng } from "../rng";
import { soundChangeSensitivity } from "../lexicon/expressive";
import { corenessResistance } from "../lexicon/coreness";
import { isFormLegal, repairSyllabicity } from "./wordShape";
import { stressClass, type StressPattern } from "./stress";
import { isVowel } from "./ipa";
import { stripTone } from "./tone";

export interface ApplyOptions {
  globalRate: number;
  weights: Record<string, number>;
  rateMultiplier?: number;
  frequencyHints?: Record<Meaning, number>;
  agesSinceChange?: Record<Meaning, number>;
  registerOf?: Record<Meaning, "high" | "low">;
  stressPattern?: StressPattern;
  lexicalStress?: Record<Meaning, number>;
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

function frequencyFor(meaning: Meaning, hints?: Record<Meaning, number>): number {
  if (!hints) return DEFAULT_FREQUENCY;
  const v = hints[meaning];
  return typeof v === "number" ? Math.max(0, Math.min(1, v)) : DEFAULT_FREQUENCY;
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
  const freqExponent = 0.4 + Math.max(0.05, Math.min(1, freq + registerShift)) * 1.2;
  const age = opts.agesSinceChange?.[meaning];
  const ageMult = ageBoost(age);
  const coreMult = corenessResistance(meaning);

  let current = word;
  const lexicalIdx = opts.lexicalStress?.[meaning];
  for (const change of changes) {
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
    const lambda = Math.min(
      3,
      adjusted *
        weight *
        opts.globalRate *
        mult *
        ageMult *
        coreMult *
        lenFactor,
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
  for (const m of meanings) {
    const sensitivity = soundChangeSensitivity(m);
    if (sensitivity < 1 && !rng.chance(sensitivity)) {
      out[m] = lexicon[m]!.slice();
      continue;
    }
    const next = applyChangesToWord(lexicon[m]!, changes, rng, opts, m);
    if (next.length === 0) continue;
    if (!isFormLegal(m, next)) {
      const repaired = repairSyllabicity(next);
      if (repaired !== next && isFormLegal(m, repaired)) {
        out[m] = repaired;
        continue;
      }
      out[m] = lexicon[m]!.slice();
      continue;
    }
    out[m] = next;
  }

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
