import type { LanguageTree, Meaning } from "../types";
import { leafIds } from "../tree/split";
import { formToString } from "../phonology/ipa";

export interface CognateEntry {
  languageId: string;
  languageName: string;
  form: string;
  extinct: boolean;
}

/**
 * Trace a meaning across every language in the tree (alive and extinct).
 * Returns the form in each one, or "—" if the word has been retired or
 * semantically shifted out of that language.
 */
export function findCognates(tree: LanguageTree, meaning: Meaning): CognateEntry[] {
  const result: CognateEntry[] = [];
  for (const id of Object.keys(tree).sort()) {
    const node = tree[id]!;
    const form = node.language.lexicon[meaning];
    result.push({
      languageId: id,
      languageName: node.language.name,
      form: form ? formToString(form) : "—",
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

/**
 * Trace a meaning back up the ancestry chain of one leaf language, so we can
 * show "water was wodr in Proto, watr in L-3, wat in Modern Foo."
 */
export function traceEtymology(
  tree: LanguageTree,
  leafId: string,
  meaning: Meaning,
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
    const form = node.language.lexicon[meaning];
    steps.push({
      generation: node.splitGeneration ?? node.language.birthGeneration,
      form: form ? formToString(form) : "—",
      languageId: id,
      languageName: node.language.name,
    });
  }
  return steps;
}

/**
 * For cross-language comparisons in the UI.
 */
export function aliveLeafIds(tree: LanguageTree): string[] {
  return leafIds(tree).filter((id) => !tree[id]!.language.extinct);
}
