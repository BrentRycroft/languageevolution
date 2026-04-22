import type {
  Language,
  LanguageEvent,
  Lexicon,
  PhonemeInventory,
  SoundChange,
} from "../types";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { parseRuleDsl, compileUserRule } from "../phonology/dsl";
import { toneOf } from "../phonology/tone";
import { GENESIS_BY_ID } from "../genesis/catalog";
import type { GenesisRule } from "../genesis/types";
import type { SimulationConfig } from "../types";

export const MAX_EVENTS_PER_LANGUAGE = 80;

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
}

export function changesForLang(lang: Language): SoundChange[] {
  const catalog = lang.enabledChangeIds
    .map((id) => CATALOG_BY_ID[id])
    .filter((c): c is SoundChange => !!c);
  const user: SoundChange[] = [];
  for (const text of lang.customRules) {
    const parsed = parseRuleDsl(text);
    if (typeof parsed !== "string") user.push(compileUserRule(parsed));
  }
  return [...catalog, ...user];
}

export function genesisRulesFor(config: SimulationConfig): GenesisRule[] {
  return config.genesis.enabledRuleIds
    .map((id) => GENESIS_BY_ID[id])
    .filter((r): r is GenesisRule => !!r);
}
