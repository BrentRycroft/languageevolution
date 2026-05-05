import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { setLexiconForm } from "./mutate";
import { posOf } from "./pos";
import { stripTone } from "../phonology/tone";
import { isVowel } from "../phonology/ipa";
import { isFormLegal } from "../phonology/wordShape";
import { featuresOf } from "../phonology/features";

const CORE_FREQ_THRESHOLD = 0.85;

/**
 * Phase 32 Tranche 32a: "core" includes content words AND high-frequency
 * pronouns / function words. Pre-fix the protection only covered content
 * words, so /i/ ↔ /eye/ collisions slipped through (eye is content +
 * core, but i is a pronoun and was excluded from core protection). Real
 * cross-linguistic constraint: high-freq pronouns are AT LEAST as
 * resistant to homophony as content words.
 */
const ALWAYS_CORE: ReadonlySet<string> = new Set([
  "i", "you", "we", "they", "he", "she", "it",
  "this", "that", "here", "there",
  "be", "have", "do", "go",
  "and", "or", "not",
  "one", "two",
]);

function isCoreMeaning(meaning: string): boolean {
  if (ALWAYS_CORE.has(meaning)) return true;
  const pos = posOf(meaning);
  return pos === "noun" || pos === "verb" || pos === "adjective";
}

/**
 * Phase 32 Tranche 32a: try to perturb a single segment in `form` so
 * the result diverges from `form` while staying phonotactically
 * legal and inventory-internal. Returns null if no good perturbation.
 *
 * Strategy: pick a vowel position, swap with a featurally-near vowel
 * from the language's inventory. If no near vowel exists, try a
 * consonant swap. Bounded — at most 4 attempts.
 */
/**
 * Phase 32 Tranche 32a: try every (position, candidate) pair in
 * featurally-sorted order until one is collision-free. Pre-fix the
 * function tried random positions, which on dense lexicons could
 * exhaust without finding a non-colliding swap. Now exhaustive
 * over feasible positions × top-N nearest candidates, deterministic.
 */
/**
 * Phase 32 Tranche 32a: try a few rng-driven perturbations until
 * one is collision-free. Each attempt picks a random position and
 * a featurally-near alternative; on dense lexicons the rng-driven
 * variation is what lets retries explore alternatives across
 * generations rather than converging on the same colliding output.
 */
function perturbForm(
  meaning: string,
  form: WordForm,
  lang: Language,
  excludeForms: ReadonlySet<string>,
  rng: Rng,
): WordForm | null {
  const inventory = lang.phonemeInventory.segmental;
  const vowels = inventory.filter((p) => isVowel(stripTone(p)));
  const consonants = inventory.filter((p) => !isVowel(stripTone(p)));

  for (let attempt = 0; attempt < 8; attempt++) {
    const positions: number[] = [];
    // Prefer vowel positions in early attempts (preserves syllable
    // shape); fall through to any-position later.
    if (attempt < 4) {
      for (let i = 0; i < form.length; i++) {
        if (isVowel(stripTone(form[i]!))) positions.push(i);
      }
    }
    if (positions.length === 0) {
      for (let i = 0; i < form.length; i++) positions.push(i);
    }
    if (positions.length === 0) return null;
    const pos = positions[rng.int(positions.length)]!;
    const current = form[pos]!;
    const isV = isVowel(stripTone(current));
    const pool = isV ? vowels : consonants;
    const candidates = pool.filter((p) => p !== current);
    if (candidates.length === 0) continue;
    candidates.sort((a, b) => {
      const fa = featuresOf(a);
      const fb = featuresOf(b);
      const fc = featuresOf(current);
      if (!fa || !fc || !fb) return 0;
      return featureDistance(fa, fc) - featureDistance(fb, fc);
    });
    // Pick from the top-3 nearest; rng-driven so retries explore.
    const topN = Math.min(3, candidates.length);
    const pick = candidates[rng.int(topN)]!;
    const next = form.slice();
    next[pos] = pick;
    if (!isFormLegal(meaning, next)) continue;
    const k = next.join(" ");
    if (excludeForms.has(k)) continue;
    return next;
  }
  return null;
}

function featureDistance(a: ReturnType<typeof featuresOf>, b: ReturnType<typeof featuresOf>): number {
  if (!a || !b || a.type !== b.type) return Infinity;
  let d = 0;
  if (a.type === "consonant" && b.type === "consonant") {
    if (a.place !== b.place) d += 1;
    if (a.manner !== b.manner) d += 1;
    if (a.voice !== b.voice) d += 1;
  } else if (a.type === "vowel" && b.type === "vowel") {
    if (a.height !== b.height) d += 1;
    if (a.backness !== b.backness) d += 1;
    if (a.round !== b.round) d += 0.5;
  }
  return d;
}

/**
 * Phase 32 Tranche 32a: scan the lexicon for collisions where two or
 * more high-frequency core meanings (freq ≥ 0.85, content POS) share
 * the same surface form, and perturb all but the highest-frequency
 * one to break the collision. Pre-Phase-32 the Phase 30b protection
 * only blocked NEW collisions during sound-change steps; pre-existing
 * collisions (from seed homophony, accumulated drift, or paths that
 * bypassed the protection like recarve / lexical replacement) stuck
 * around indefinitely. The default preset surveyed at 60 gens with 4
 * core collisions including "father=mother=water=/gagiːg/".
 *
 * Returns the number of collisions resolved this call. Cheap — runs
 * each gen in stepInventoryManagement.
 */
/**
 * Phase 32 Tranche 32a: walk the lexicon, find core-meaning
 * collisions, and perturb the lower-priority loser to break each
 * one. Loops up to 3 passes — pre-fix a single pass left some
 * stubborn collisions because perturbation could land on a form
 * that collided with another core word, leaving the original
 * collision still in place. Multi-pass converges.
 */
export function disambiguateCoreCollisions(
  lang: Language,
  rng: Rng,
  generation: number,
): number {
  let total = 0;
  for (let pass = 0; pass < 3; pass++) {
    const resolved = disambiguateCoreCollisionsOnce(lang, rng, generation);
    total += resolved;
    if (resolved === 0) break;
  }
  return total;
}

function disambiguateCoreCollisionsOnce(
  lang: Language,
  rng: Rng,
  generation: number,
): number {
  const coreMeanings: string[] = [];
  for (const m of Object.keys(lang.lexicon)) {
    const freq = lang.wordFrequencyHints[m] ?? 0.5;
    if (freq >= CORE_FREQ_THRESHOLD && isCoreMeaning(m)) {
      coreMeanings.push(m);
    } else if (ALWAYS_CORE.has(m)) {
      // Always-core meanings get protection regardless of recorded
      // frequency — pronouns / aux / negation are too central for
      // a pre-Phase-32 freq-hint table to undercut.
      coreMeanings.push(m);
    }
  }
  if (coreMeanings.length < 2) return 0;

  const byForm = new Map<string, string[]>();
  for (const m of coreMeanings) {
    const f = lang.lexicon[m];
    if (!f || f.length === 0) continue;
    const k = f.join(" ");
    const list = byForm.get(k);
    if (list) list.push(m);
    else byForm.set(k, [m]);
  }

  // For collision detection in perturbation, build a set of all forms
  // (not just core) so the perturbed form doesn't accidentally hit
  // another existing word.
  const allForms = new Set<string>();
  for (const m of Object.keys(lang.lexicon)) {
    allForms.add(lang.lexicon[m]!.join(" "));
  }

  let resolved = 0;
  for (const [, meanings] of byForm) {
    if (meanings.length < 2) continue;
    meanings.sort((a, b) => {
      const fa = lang.wordFrequencyHints[a] ?? 0.5;
      const fb = lang.wordFrequencyHints[b] ?? 0.5;
      if (fb !== fa) return fb - fa;
      return a < b ? -1 : 1; // deterministic tie-break
    });
    for (let i = 1; i < meanings.length; i++) {
      const loser = meanings[i]!;
      const original = lang.lexicon[loser]!;
      let perturbed: WordForm | null = perturbForm(loser, original, lang, allForms, rng);
      // Fallback: append a vowel.
      if (!perturbed) {
        const vowels = lang.phonemeInventory.segmental.filter((p) => isVowel(stripTone(p)));
        for (const v of vowels) {
          const candidate = [...original, v];
          if (!isFormLegal(loser, candidate)) continue;
          if (allForms.has(candidate.join(" "))) continue;
          perturbed = candidate;
          break;
        }
      }
      // Last-resort fallback: prefix a consonant.
      if (!perturbed) {
        const consonants = lang.phonemeInventory.segmental.filter((p) => !isVowel(stripTone(p)));
        for (const c of consonants) {
          const candidate = [c, ...original];
          if (!isFormLegal(loser, candidate)) continue;
          if (allForms.has(candidate.join(" "))) continue;
          perturbed = candidate;
          break;
        }
      }
      if (!perturbed) continue;
      setLexiconForm(lang, loser, perturbed, {
        bornGeneration: generation,
        origin: "core-disambiguation",
      });
      allForms.add(perturbed.join(" "));
      resolved++;
    }
  }
  return resolved;
}
