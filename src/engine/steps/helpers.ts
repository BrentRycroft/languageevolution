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

// Ring-buffer cap for per-language events. Re-exported from the
// engine constants module so callers continue to import from this
// helper module.
export { MAX_EVENTS_PER_LANGUAGE } from "../constants";
import { MAX_EVENTS_PER_LANGUAGE } from "../constants";

export function pushEvent(lang: Language, event: LanguageEvent): void {
  lang.events.push(event);
  if (lang.events.length > MAX_EVENTS_PER_LANGUAGE) {
    lang.events.splice(0, lang.events.length - MAX_EVENTS_PER_LANGUAGE);
  }
}

export function inventoryFromLexicon(lex: Lexicon): PhonemeInventory {
  const set = new Set<string>();
  for (const m of Object.keys(lex)) for (const p of lex[m]!) set.add(p);
  return {
    segmental: Array.from(set).sort(),
    tones: [],
    usesTones: false,
  };
}

/**
 * Seed the per-phoneme provenance map with "native" for every
 * phoneme already in the inventory. Called from init.ts so the
 * proto's inventory has a recorded provenance baseline; subsequent
 * refreshInventory calls maintain it.
 */
export function seedNativeProvenance(lang: Language): void {
  if (!lang.inventoryProvenance) lang.inventoryProvenance = {};
  for (const p of lang.phonemeInventory.segmental) {
    if (!lang.inventoryProvenance[p]) {
      lang.inventoryProvenance[p] = { source: "native" };
    }
  }
}

export function refreshInventory(lang: Language): void {
  const observed = new Set<string>();
  const tones = new Set<string>();
  for (const m of Object.keys(lang.lexicon)) {
    for (const p of lang.lexicon[m]!) {
      observed.add(p);
      const t = toneOf(p);
      if (t) tones.add(t);
    }
  }
  lang.phonemeInventory.segmental = Array.from(observed).sort();
  lang.phonemeInventory.tones = Array.from(tones).sort();
  lang.phonemeInventory.usesTones = tones.size > 0;
  // Provenance bookkeeping: any phoneme that's in the inventory but
  // not in the provenance map gets defaulted to "native". Phonemes
  // that disappeared from the inventory have their provenance entry
  // cleared (avoids stale entries piling up over millennia).
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
    // Specialise UNSTRESSED_REDUCTION to the language's actual stress
    // pattern. The catalog ships a generic penult-default version, but
    // a language with `stressPattern: "initial"` should reduce
    // non-initial vowels, not non-penult ones — otherwise stress
    // pattern drift only changes the narrow-transcription view but
    // leaves the underlying reduction targeting the wrong syllables.
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
  // Rebuild a thin wrapper that delegates to stress.ts's per-pattern
  // `stressClass`. Without this the catalog version always uses
  // penult, so a language that drifted to initial or final stress
  // would have its narrow transcription show one stress and its
  // underlying reduction target a different one.
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
