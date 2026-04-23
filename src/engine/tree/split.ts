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

/**
 * Pairs of catalog rule ids that compose into runaway loops if both are
 * enabled in the same language. Currently the only known offender is
 * gemination.emphatic (V_C_V → V_CC_V) plus insertion.anaptyxis
 * (CC → CəC) — they feed each other on the new ə, blowing form length
 * up by ~2 phonemes per generation. The 2000-gen smoke test surfaced
 * this with germanic forms reaching 15,000+ phonemes.
 *
 * `perturbChangeSet` consults this list before adding a disabled rule
 * to a daughter language so the daughter never inherits a cascade pair.
 */
const INCOMPATIBLE_RULE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["gemination.emphatic", "insertion.anaptyxis"],
];

function wouldCascade(set: Set<string>, candidate: string): boolean {
  for (const [a, b] of INCOMPATIBLE_RULE_PAIRS) {
    if (candidate === a && set.has(b)) return true;
    if (candidate === b && set.has(a)) return true;
  }
  return false;
}

function perturbChangeSet(
  parentEnabled: string[],
  rng: Rng,
): string[] {
  const set = new Set(parentEnabled);
  const all = CATALOG.map((c) => c.id);
  // Only consider candidates that wouldn't form a cascade pair with
  // anything already in the set.
  const disabled = all.filter(
    (id) => !set.has(id) && !wouldCascade(set, id),
  );
  if (rng.chance(0.5) && disabled.length > 0) {
    set.add(disabled[rng.int(disabled.length)]!);
  } else if (set.size > 1) {
    const arr = Array.from(set);
    set.delete(arr[rng.int(arr.length)]!);
  }
  return Array.from(set).sort();
}

function depthOf(tree: LanguageTree, id: string): number {
  let depth = 0;
  let cur: string | null = id;
  while (cur) {
    const parent: string | null = tree[cur]?.parentId ?? null;
    if (!parent) break;
    cur = parent;
    depth++;
  }
  return depth;
}

function fnv1aFloat(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return (h >>> 0) / 0xffffffff;
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
  // Persistent map coordinates: place the two daughters on either side
  // of the parent at a distance that decays with depth, in directions
  // determined by a deterministic hash of their ids. Once written the
  // coords stay frozen unless the user drags the node in MapView.
  const parentCoords = parentLang.coords ?? { x: 0, y: 0 };
  const depth = depthOf(tree, parentId);
  const step = 80 / Math.sqrt(1 + depth);
  const baseAngle = (fnv1aFloat(parentId + ":" + generation) * Math.PI * 2);
  const jitterA = (rng.next() - 0.5) * 0.6;
  const jitterB = (rng.next() - 0.5) * 0.6;
  const angleA = baseAngle + jitterA;
  const angleB = baseAngle + Math.PI + jitterB;
  a.coords = {
    x: parentCoords.x + Math.cos(angleA) * step,
    y: parentCoords.y + Math.sin(angleA) * step,
  };
  b.coords = {
    x: parentCoords.x + Math.cos(angleB) * step,
    y: parentCoords.y + Math.sin(angleB) * step,
  };
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
