import type { Language, LanguageNode, LanguageTree, Lexicon } from "../types";
import { CATALOG, CATALOG_BY_ID } from "../phonology/catalog";
import { clonePopulation } from "../agents/population";
import type { Rng } from "../rng";

function cloneLexicon(lex: Lexicon): Lexicon {
  const out: Lexicon = {};
  for (const m of Object.keys(lex)) out[m] = lex[m]!.slice();
  return out;
}

export function leafIds(tree: LanguageTree): string[] {
  return Object.keys(tree)
    .filter((id) => tree[id]!.childrenIds.length === 0)
    .sort();
}

function perturbChangeSet(
  parentEnabled: string[],
  rng: Rng,
): string[] {
  const set = new Set(parentEnabled);
  const all = CATALOG.map((c) => c.id);
  const disabled = all.filter((id) => !set.has(id));
  if (rng.chance(0.5) && disabled.length > 0) {
    set.add(disabled[rng.int(disabled.length)]!);
  } else if (set.size > 1) {
    const arr = Array.from(set);
    set.delete(arr[rng.int(arr.length)]!);
  }
  return Array.from(set).sort();
}

export function splitLeaf(
  tree: LanguageTree,
  parentId: string,
  generation: number,
  rng: Rng,
): [string, string] {
  const parent = tree[parentId]!;
  const parentLang = parent.language;
  let nextCounter = Object.keys(tree).length;
  const makeChild = (perturb: boolean): Language => {
    const id = `L-${nextCounter++}`;
    const enabled = perturb
      ? perturbChangeSet(parentLang.enabledChangeIds, rng)
      : parentLang.enabledChangeIds.slice();
    const weights: Record<string, number> = {};
    for (const cid of enabled) {
      weights[cid] = parentLang.changeWeights[cid] ?? CATALOG_BY_ID[cid]?.baseWeight ?? 1;
    }
    return {
      id,
      name: id,
      lexicon: cloneLexicon(parentLang.lexicon),
      population: parentLang.population ? clonePopulation(parentLang.population, id) : undefined,
      enabledChangeIds: enabled,
      changeWeights: weights,
      birthGeneration: generation,
    };
  };
  const a = makeChild(false);
  const b = makeChild(true);
  const childA: LanguageNode = {
    language: a,
    parentId,
    childrenIds: [],
    splitGeneration: generation,
  };
  const childB: LanguageNode = {
    language: b,
    parentId,
    childrenIds: [],
    splitGeneration: generation,
  };
  tree[a.id] = childA;
  tree[b.id] = childB;
  parent.childrenIds = [a.id, b.id];
  return [a.id, b.id];
}
