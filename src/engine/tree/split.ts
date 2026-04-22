import type { Language, LanguageNode, LanguageTree } from "../types";
import { CATALOG, CATALOG_BY_ID } from "../phonology/catalog";
import { generateName } from "../naming";
import { cloneLexicon, cloneGrammar, cloneMorphology } from "../utils/clone";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";
import type { Rng } from "../rng";

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

function jitterBias(
  parent: Record<string, number>,
  rng: Rng,
  scale: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [family, w] of Object.entries(parent)) {
    const delta = (rng.next() * 2 - 1) * scale;
    out[family] = Math.max(0.15, w + delta);
  }
  return out;
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
      name: generateName(parentLang, rng),
      lexicon: cloneLexicon(parentLang.lexicon),
      enabledChangeIds: enabled,
      changeWeights: weights,
      birthGeneration: generation,
      grammar: cloneGrammar(parentLang.grammar),
      events: [],
      wordFrequencyHints: { ...parentLang.wordFrequencyHints },
      phonemeInventory: {
        segmental: parentLang.phonemeInventory.segmental.slice(),
        tones: parentLang.phonemeInventory.tones.slice(),
        usesTones: parentLang.phonemeInventory.usesTones,
      },
      morphology: cloneMorphology(parentLang.morphology),
      localNeighbors: Object.fromEntries(
        Object.entries(parentLang.localNeighbors).map(([k, v]) => [k, v.slice()]),
      ),
      // Daughters inherit parent's tempo with ±30% jitter, clamped to
      // [0.3, 1.8]. So sister languages frequently diverge in tempo, not just
      // form — one becomes the "turtle", the other the "hare".
      conservatism: Math.max(
        0.3,
        Math.min(1.8, parentLang.conservatism * (0.7 + rng.next() * 0.6)),
      ),
      wordOrigin: { ...parentLang.wordOrigin },
      // Daughters inherit the parent's procedural rule stack, dropping a
      // random ~30% so sisters begin to diverge immediately.
      activeRules: (parentLang.activeRules ?? [])
        .filter(() => rng.chance(0.7))
        .map((r) => ({ ...r })),
      retiredRules: (parentLang.retiredRules ?? []).map((r) => ({ ...r })),
      // Jitter the rule-family bias by ±0.3 so the two sisters develop
      // different phonological tastes over time.
      ruleBias: jitterBias(parentLang.ruleBias ?? { ...DEFAULT_RULE_BIAS }, rng, 0.3),
      registerOf: { ...(parentLang.registerOf ?? {}) },
      orthography: { ...parentLang.orthography },
      otRanking: parentLang.otRanking.slice(),
      lastChangeGeneration: { ...parentLang.lastChangeGeneration },
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
