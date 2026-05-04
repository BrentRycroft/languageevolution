import type {
  Language,
  LanguageEvent,
  Lexicon,
  PhonemeInventory,
  SoundChange,
} from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { generatedToSoundChange } from "../phonology/generated";
import { toneOf, stripTone, isToneBearing, MID } from "../phonology/tone";
import { isVowel } from "../phonology/ipa";
import { stressClass } from "../phonology/stress";
import { GENESIS_BY_ID } from "../genesis/catalog";
import type { GenesisRule } from "../genesis/types";
import type { SimulationConfig } from "../types";

export { MAX_EVENTS_PER_LANGUAGE } from "../constants";
import { MAX_EVENTS_PER_LANGUAGE } from "../constants";

export function pushEvent(lang: Language, event: LanguageEvent): void {
  lang.events.push(event);
  if (lang.events.length > MAX_EVENTS_PER_LANGUAGE) {
    lang.events.splice(0, lang.events.length - MAX_EVENTS_PER_LANGUAGE);
  }
}

export function inventoryFromLexicon(lex: Lexicon): PhonemeInventory {
  // Phase 30 Tranche 30a: segmental inventory tracks tone-stripped
  // base phonemes only. Tone-bearing allotones (a˥, a˧, a˩, a˧˥)
  // collapse to /a/ for size-of-inventory accounting; tones live
  // separately in the `tones` array.
  const set = new Set<string>();
  const tones = new Set<string>();
  for (const m of Object.keys(lex)) {
    for (const p of lex[m]!) {
      const base = stripTone(p);
      set.add(base);
      const t = toneOf(p);
      if (t) tones.add(t);
    }
  }
  return {
    segmental: Array.from(set).sort(),
    tones: Array.from(tones).sort(),
    usesTones: tones.size > 0,
  };
}

/**
 * Phase 29 Tranche 1c: derived phoneme-set view. Returns a fresh
 * Set computed from the lexicon (or `lang.words` when present), so
 * callers that just want O(1) "does this language have phoneme X"
 * checks don't have to scan the segmental array. The cached array
 * `phonemeInventory.segmental` remains the source of truth for ORDER
 * (tier-target pruning needs deterministic ordering); this getter is
 * for SET-membership questions where order doesn't matter.
 */
export function getPhonemeSet(lang: Language): ReadonlySet<string> {
  // Prefer the cached array — it's already deduped and pruning may
  // have removed phonemes we don't want surfaced.
  return new Set(lang.phonemeInventory.segmental);
}

export function seedNativeProvenance(lang: Language): void {
  if (!lang.inventoryProvenance) lang.inventoryProvenance = {};
  for (const p of lang.phonemeInventory.segmental) {
    if (!lang.inventoryProvenance[p]) {
      lang.inventoryProvenance[p] = { source: "native" };
    }
  }
}

/**
 * Phase 31 Tranche 31a: classify a language's tonal regime by
 * counting toned vs total tone-bearing positions in the lexicon.
 *
 * Real linguistics: tone is essentially all-or-nothing per language.
 *   - tonal:        ≥ 50% of tone-bearing positions are toned
 *   - non-tonal:    ≤ 5% of tone-bearing positions are toned
 *   - pitch-accent: in-between AND each toned word has exactly 1
 *                   marked syllable on average
 *
 * The thresholds are deliberately wide so that brief mid-transition
 * states stick: once a language crosses the 50% threshold (e.g.
 * after a tonogenesis cascade), it stays tonal until detonogenesis
 * pushes coverage back below 5%. The "pitch-accent" tier is reserved
 * for languages with sparse but deliberate marking; we leave its
 * lexicon alone.
 */
export function classifyToneRegime(lang: Language): "non-tonal" | "tonal" | "pitch-accent" {
  let toneBearing = 0;
  let toned = 0;
  let toneBearingWords = 0;
  let toneMarkSum = 0;
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m]!;
    let wTb = 0;
    let wT = 0;
    for (const p of f) {
      if (isToneBearing(p)) {
        wTb++;
        if (toneOf(p)) wT++;
      }
    }
    toneBearing += wTb;
    toned += wT;
    if (wTb > 0) {
      toneBearingWords++;
      if (wT > 0) toneMarkSum += wT;
    }
  }
  if (toneBearing === 0) return "non-tonal";
  const coverage = toned / toneBearing;
  if (coverage >= 0.5) return "tonal";
  if (coverage <= 0.05) return "non-tonal";
  // Pitch-accent: in-between coverage AND words that ARE toned have
  // ~1 mark each on average (Japanese / Norwegian pattern).
  const markedWords = toneBearingWords > 0
    ? Math.round(toneMarkSum / Math.max(1, toneBearingWords))
    : 0;
  if (coverage > 0.05 && coverage < 0.5 && markedWords <= 1) return "pitch-accent";
  // Anything else is treated as non-tonal noise — the auto-strip
  // path in refreshInventory will discard residual marks.
  return "non-tonal";
}

/**
 * Phase 31 Tranche 31b: normalise the lexicon to match the tonal
 * regime. For non-tonal languages, strip residual tone marks; for
 * tonal languages, fill un-toned tone-bearing positions in
 * partly-toned words with MID tone (default carrier). Pitch-accent
 * is left untouched.
 */
function normaliseToneRegime(
  lang: Language,
  regime: "non-tonal" | "tonal" | "pitch-accent",
): void {
  if (regime === "pitch-accent") return;
  let mutated = false;
  for (const m of Object.keys(lang.lexicon)) {
    const f = lang.lexicon[m]!;
    let needsRewrite = false;
    if (regime === "non-tonal") {
      for (const p of f) {
        if (toneOf(p)) { needsRewrite = true; break; }
      }
      if (!needsRewrite) continue;
      lang.lexicon[m] = f.map((p) => stripTone(p));
      mutated = true;
    } else {
      // tonal — auto-fill MID into un-toned tone-bearing positions
      // of words whose tone-bearing positions are PARTLY toned.
      let tbp = 0;
      let toned = 0;
      for (const p of f) {
        if (isToneBearing(p)) {
          tbp++;
          if (toneOf(p)) toned++;
        }
      }
      if (tbp === 0 || toned === 0) continue;
      if (toned === tbp) continue; // already fully toned
      const next = f.map((p) => {
        if (!isToneBearing(p)) return p;
        if (toneOf(p)) return p;
        return p + MID;
      });
      lang.lexicon[m] = next;
      mutated = true;
    }
  }
  // The mutation above bypasses setLexiconForm — we deliberately
  // skip the words-table sync because toneRegime normalisation runs
  // every gen as part of refreshInventory and the per-form sync
  // would fire O(N) times. The lang.words table syncs naturally on
  // the next syncWordsAfterPhonology pass at end of stepPhonology.
  void mutated;
}

export function refreshInventory(lang: Language): void {
  // Phase 31 Tranche 31a/b: classify the language's tonal regime
  // and normalise the lexicon to match — non-tonal languages get
  // residual tone marks stripped; partly-toned tonal languages get
  // un-marked positions auto-filled with MID. Pre-fix the simulator
  // produced "32% of words tonal, 68% not" inconsistent states for
  // Bantu and noisy 5% tonalisation for English.
  const regime = classifyToneRegime(lang);
  lang.toneRegime = regime;
  normaliseToneRegime(lang, regime);

  // Phase 30 Tranche 30a: segmental holds tone-stripped base
  // phonemes; tones live in `tones`. Pre-fix this set held
  // tone-bearing allotones (`a˥`, `a˧`, `a˩`, `a˧˥`) as separate
  // entries, so a 14-vowel system with 3 tones counted as 14×3=42
  // "phonemes" — driving tier-target overshoot and homeostatic
  // merger spam.
  const observed = new Set<string>();
  const tones = new Set<string>();
  for (const m of Object.keys(lang.lexicon)) {
    for (const p of lang.lexicon[m]!) {
      observed.add(stripTone(p));
      const t = toneOf(p);
      if (t) tones.add(t);
    }
  }
  lang.phonemeInventory.segmental = Array.from(observed).sort();
  lang.phonemeInventory.tones = Array.from(tones).sort();
  // Phase 31 Tranche 31a: usesTones is now derived from the regime,
  // not from "any tone in any word." This stops sporadic tonogenesis
  // fires from flagging a non-tonal language as tonal.
  lang.phonemeInventory.usesTones = regime !== "non-tonal";
  if (!lang.inventoryProvenance) lang.inventoryProvenance = {};
  for (const p of observed) {
    if (!lang.inventoryProvenance[p]) {
      lang.inventoryProvenance[p] = { source: "native" };
    }
  }
  for (const p of Object.keys(lang.inventoryProvenance)) {
    if (!observed.has(p)) delete lang.inventoryProvenance[p];
  }
}

export function changesForLang(lang: Language): SoundChange[] {
  const pattern = lang.stressPattern;
  // Phase 31 Tranche 31c: gate tonogenesis-family rules on the
  // language's tonal regime. Non-tonal languages don't run
  // tonogenesis at all — the per-word firing was the source of the
  // "5% of English words have random tones" noise. Tonal languages
  // run tonogenesis at full rate. Pitch-accent leans on
  // detonogenesis to gradually erode marks.
  const regime = lang.toneRegime ?? "non-tonal";
  const catalog = lang.enabledChangeIds
    .map((id) => CATALOG_BY_ID[id])
    .filter((c): c is SoundChange => !!c)
    .filter((c) => {
      if (regime === "non-tonal" && c.category === "tonogenesis") return false;
      return true;
    })
    .map((c) =>
      c.id === "stress.unstressed_reduction" && pattern && pattern !== "penult"
        ? specialiseUnstressedReduction(c, pattern)
        : c,
    );
  const procedural = (lang.activeRules ?? []).map(generatedToSoundChange);
  return [...catalog, ...procedural];
}

function specialiseUnstressedReduction(
  base: SoundChange,
  pattern: NonNullable<Language["stressPattern"]>,
): SoundChange {
  return {
    ...base,
    probabilityFor: (word) => {
      let n = 0;
      for (let i = 0; i < word.length; i++) {
        const p = word[i]!;
        if (!isVowel(stripTone(p))) continue;
        if (stripTone(p) === "ə") continue;
        if (stressClass(word, i, pattern) === "unstressed") n++;
      }
      return 1 - Math.pow(1 - 0.06, n);
    },
    apply: (word, rng) => {
      const sites: number[] = [];
      for (let i = 0; i < word.length; i++) {
        const p = word[i]!;
        if (!isVowel(stripTone(p))) continue;
        if (stripTone(p) === "ə") continue;
        if (stressClass(word, i, pattern) === "unstressed") sites.push(i);
      }
      if (sites.length === 0) return word;
      const idx = sites[rng.int(sites.length)]!;
      const out = word.slice();
      const stripped = stripTone(word[idx]!);
      const t =
        word[idx]!.length > stripped.length
          ? word[idx]!.slice(stripped.length)
          : "";
      out[idx] = "ə" + t;
      return out;
    },
  };
}

export function genesisRulesFor(config: SimulationConfig): GenesisRule[] {
  return config.genesis.enabledRuleIds
    .map((id) => GENESIS_BY_ID[id])
    .filter((r): r is GenesisRule => !!r);
}
