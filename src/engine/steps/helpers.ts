import type {
  Language,
  LanguageEvent,
  Lexicon,
  PhonemeInventory,
  SoundChange,
} from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { generatedToSoundChange } from "../phonology/generated";
import { toneOf, stripTone } from "../phonology/tone";
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

export function refreshInventory(lang: Language): void {
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
  lang.phonemeInventory.usesTones = tones.size > 0;
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
  const catalog = lang.enabledChangeIds
    .map((id) => CATALOG_BY_ID[id])
    .filter((c): c is SoundChange => !!c)
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
