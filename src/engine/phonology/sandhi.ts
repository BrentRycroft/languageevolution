import type { Language, WordForm } from "../types";
import type { Rng } from "../rng";
import { HIGH, LOW, MID, RISING, FALLING, isToneBearing, toneOf, stripTone } from "./tone";
import { setLexiconForm } from "../lexicon/mutate";

/**
 * Phase 29 Tranche 5g: tone sandhi.
 *
 * Cross-linguistic tone sandhi is the phenomenon where adjacent tones
 * influence each other's surface realisation. Mandarin's third-tone
 * sandhi is the canonical example (T3 + T3 → T2 + T3, "ní hǎo"
 * pronounced "ní hǎo" not "nǐ hǎo"). Other examples:
 *   - Hakka, Cantonese, Min: similar contour-tone sandhi.
 *   - Cantonese: T3 + T3 → T2 + T3 (analogous to Mandarin).
 *   - Niger-Congo high-tone spreading.
 *
 * Phase 25 added tonogenesis but no sandhi rules. The catalog has
 * `tone_spread` (a free-roaming high tone propagating to a neighbour)
 * but no contour-aware adjacency resolution.
 *
 * `applyToneSandhi` walks the lexicon once per generation and rewrites
 * adjacent-tone sequences according to a small set of attested
 * patterns. Keep enabled per-leaf when `lang.phonemeInventory.usesTones`.
 */

interface SandhiRule {
  id: string;
  description: string;
  /** Match a (tone, tone) adjacency. Returns the replacement (preceding, following) tones. */
  match: (a: string, b: string) => [string, string] | null;
  /** Per-site probability per generation. */
  perSiteProb: number;
}

const SANDHI_RULES: ReadonlyArray<SandhiRule> = [
  {
    // Mandarin third-tone sandhi: T3 + T3 → T2 + T3.
    // We model T3 as LOW and T2 as RISING.
    id: "sandhi.low_low_to_rising_low",
    description: "Adjacent low tones — first dissimilates to rising (Mandarin tone-3 sandhi).",
    match: (a, b) => (a === LOW && b === LOW ? [RISING, LOW] : null),
    perSiteProb: 0.35,
  },
  {
    // High-tone OCP: H + H → H + Mid (avoid violating the OCP on tone tier).
    id: "sandhi.high_high_to_high_mid",
    description: "Two adjacent high tones — second drops to mid (OCP on tone tier).",
    match: (a, b) => (a === HIGH && b === HIGH ? [HIGH, MID] : null),
    perSiteProb: 0.25,
  },
  {
    // Falling-then-rising contour smoothing.
    id: "sandhi.falling_rising_to_falling_high",
    description: "A falling contour followed by a rising contour smooths to falling-high.",
    match: (a, b) => (a === FALLING && b === RISING ? [FALLING, HIGH] : null),
    perSiteProb: 0.2,
  },
];

interface SandhiSite {
  meaning: string;
  posA: number; // index of the first tone-bearing segment
  posB: number; // index of the second
  rule: SandhiRule;
  newToneA: string;
  newToneB: string;
}

export function stepToneSandhi(
  lang: Language,
  rng: Rng,
  generation: number,
): number {
  void generation;
  if (!lang.phonemeInventory.usesTones) return 0;
  const sites: SandhiSite[] = [];
  for (const meaning of Object.keys(lang.lexicon)) {
    const form = lang.lexicon[meaning];
    if (!form || form.length < 2) continue;
    // Walk adjacent tone-bearing pairs (allowing intervening consonants).
    const toneIdxs: number[] = [];
    for (let i = 0; i < form.length; i++) {
      if (isToneBearing(form[i]!) && toneOf(form[i]!)) toneIdxs.push(i);
    }
    for (let k = 0; k < toneIdxs.length - 1; k++) {
      const i = toneIdxs[k]!;
      const j = toneIdxs[k + 1]!;
      const tA = toneOf(form[i]!);
      const tB = toneOf(form[j]!);
      if (!tA || !tB) continue;
      for (const rule of SANDHI_RULES) {
        const repl = rule.match(tA, tB);
        if (!repl) continue;
        if (!rng.chance(rule.perSiteProb)) continue;
        sites.push({
          meaning,
          posA: i,
          posB: j,
          rule,
          newToneA: repl[0],
          newToneB: repl[1],
        });
        break; // one rule per site per gen
      }
    }
  }
  if (sites.length === 0) return 0;
  // Apply collected sites. Group by meaning to mutate each form once.
  const byMeaning = new Map<string, SandhiSite[]>();
  for (const s of sites) {
    const list = byMeaning.get(s.meaning);
    if (list) list.push(s);
    else byMeaning.set(s.meaning, [s]);
  }
  for (const [meaning, list] of byMeaning) {
    const form = lang.lexicon[meaning]!;
    const next: WordForm = form.slice();
    for (const s of list) {
      const baseA = stripTone(next[s.posA]!);
      const baseB = stripTone(next[s.posB]!);
      next[s.posA] = baseA + s.newToneA;
      next[s.posB] = baseB + s.newToneB;
    }
    // Phase 29 Tranche 5g + Tranche 1: route through chokepoint so
    // lang.words tracks the post-sandhi form.
    setLexiconForm(lang, meaning, next, { bornGeneration: generation, origin: "tone-sandhi" });
  }
  return sites.length;
}
