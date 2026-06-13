import type { LanguageTree, Meaning } from "../types";
import { leafIds } from "../tree/split";
import { formatForm, type DisplayScript } from "../phonology/display";
import { lexFormById, idForGloss } from "../lexicon/access";

/**
 * cognates.ts
 *
 * English → target sentence (parse / realise / sentence) and target → English caption (glossToEnglish, cognates, reverse). Key exports: CognateEntry, findCognates, EtymologyStep.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export interface CognateEntry {
  languageId: string;
  languageName: string;
  form: string;
  extinct: boolean;
}

export function findCognates(
  tree: LanguageTree,
  meaning: Meaning,
  script: DisplayScript = "ipa",
): CognateEntry[] {
  const result: CognateEntry[] = [];
  for (const id of Object.keys(tree).sort()) {
    const node = tree[id]!;
    const _mid = idForGloss(node.language, meaning);
    const form = _mid !== undefined ? lexFormById(node.language, _mid) : undefined;
    result.push({
      languageId: id,
      languageName: node.language.name,
      form: form ? formatForm(form, node.language, script) : "—",
      extinct: !!node.language.extinct,
    });
  }
  return result;
}

export interface EtymologyStep {
  generation: number;
  form: string;
  languageId: string;
  languageName: string;
}

export function traceEtymology(
  tree: LanguageTree,
  leafId: string,
  meaning: Meaning,
  script: DisplayScript = "ipa",
): EtymologyStep[] {
  const chain: string[] = [];
  let cur: string | null = leafId;
  while (cur) {
    chain.unshift(cur);
    cur = tree[cur]?.parentId ?? null;
  }
  const steps: EtymologyStep[] = [];
  for (const id of chain) {
    const node = tree[id]!;
    const _mid2 = idForGloss(node.language, meaning);
    const form = _mid2 !== undefined ? lexFormById(node.language, _mid2) : undefined;
    steps.push({
      generation: node.splitGeneration ?? node.language.birthGeneration,
      form: form ? formatForm(form, node.language, script) : "—",
      languageId: id,
      languageName: node.language.name,
    });
  }
  return steps;
}

export function aliveLeafIds(tree: LanguageTree): string[] {
  return leafIds(tree).filter((id) => !tree[id]!.language.extinct);
}
