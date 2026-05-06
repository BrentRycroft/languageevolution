import type { Language, LanguageNode, LanguageTree } from "../types";
import { CATALOG, CATALOG_BY_ID } from "../phonology/catalog";
import { generateName } from "../naming";
import { cloneLexicon, cloneGrammar, cloneMorphology } from "../utils/clone";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";
import { fnv1a } from "../rng";
import type { Rng } from "../rng";
import { lexicalCapacity } from "../lexicon/tier";
import { rebuildFormKeyIndex } from "../lexicon/word";
import { partitionTerritory } from "../geo/territory";
import type { WorldMap } from "../geo/map";
import { leafIds } from "./leafIds";
import { CONSERVATISM_MIN, CONSERVATISM_MAX } from "../constants";
import { applyFounderInnovation } from "./founder";

export { leafIds };

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
  return (fnv1a(s) >>> 0) / 0xffffffff;
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

function pickChildCount(rng: Rng): number {
  const r = rng.next();
  if (r < 0.6) return 2;
  if (r < 0.85) return 3;
  if (r < 0.93) return 4;
  if (r < 0.97) return 5;
  if (r < 0.99) return 6;
  if (r < 0.995) return 7;
  if (r < 0.998) return 8;
  return 9;
}

export function pickFirstSplitChildCount(rng: Rng): number {
  const r = rng.next();
  if (r < 0.45) return 3;
  if (r < 0.75) return 4;
  if (r < 0.87) return 5;
  if (r < 0.94) return 6;
  if (r < 0.98) return 7;
  return 8;
}

export interface SplitOptions {
  childCount?: number;
  worldMap?: WorldMap;
}

export function splitLeaf(
  tree: LanguageTree,
  parentId: string,
  generation: number,
  rng: Rng,
  opts: SplitOptions = {},
): string[] {
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
      inventoryProvenance: parentLang.inventoryProvenance
        ? Object.fromEntries(
            Object.entries(parentLang.inventoryProvenance).map(([k, v]) => [k, { ...v }]),
          )
        : undefined,
      morphology: cloneMorphology(parentLang.morphology),
      localNeighbors: Object.fromEntries(
        Object.entries(parentLang.localNeighbors).map(([k, v]) => [k, v.slice()]),
      ),
      conservatism: Math.max(
        CONSERVATISM_MIN,
        Math.min(CONSERVATISM_MAX, parentLang.conservatism * (0.7 + rng.next() * 0.6)),
      ),
      speakers: Math.max(
        50,
        Math.round(
          ((parentLang.speakers ?? 10000) / 3) * (0.3 + rng.next() * 1.7),
        ),
      ),
      wordOrigin: { ...parentLang.wordOrigin },
      activeRules: (parentLang.activeRules ?? [])
        .filter(() => rng.chance(0.7))
        .map((r) => ({ ...r })),
      retiredRules: (parentLang.retiredRules ?? []).map((r) => ({ ...r })),
      ruleBias: jitterBias(parentLang.ruleBias ?? { ...DEFAULT_RULE_BIAS }, rng, 0.3),
      registerOf: { ...(parentLang.registerOf ?? {}) },
      orthography: { ...parentLang.orthography },
      otRanking: parentLang.otRanking.slice(),
      lastChangeGeneration: { ...parentLang.lastChangeGeneration },
      stressPattern: parentLang.stressPattern,
      lexicalStress: parentLang.lexicalStress
        ? { ...parentLang.lexicalStress }
        : undefined,
      // Phase 29 Tranche 5e: daughter inherits the parent's inflection
      // class assignments. Stable across splits unless analogy re-classes.
      inflectionClass: parentLang.inflectionClass
        ? { ...parentLang.inflectionClass }
        : undefined,
      // Phase 34 Tranche 34a: daughters inherit the compound metadata.
      // After the split each daughter's compounds drift independently
      // (transparent ones recompose from the daughter's parts; fossilised
      // ones drift opaque just like any other root).
      compounds: parentLang.compounds
        ? Object.fromEntries(
            Object.entries(parentLang.compounds).map(([k, v]) => [
              k,
              {
                parts: v.parts.slice(),
                linker: v.linker?.slice(),
                fossilized: v.fossilized,
                fossilizedGen: v.fossilizedGen,
                bornGeneration: v.bornGeneration,
              },
            ]),
          )
        : undefined,
      suppletion: parentLang.suppletion
        ? Object.fromEntries(
            Object.entries(parentLang.suppletion).map(([m, slots]) => [
              m,
              { ...slots },
            ]),
          )
        : undefined,
      derivationalSuffixes: (parentLang.derivationalSuffixes ?? [])
        .filter(() => rng.chance(0.8))
        .map((s) => ({
          affix: s.affix.slice(),
          tag: s.tag,
          category: s.category, // preserve Phase 20f category tag
          // Phase 22: inherit productivity tracking. A daughter language
          // begins with the parent's already-established productive
          // rules (and their attestation counts). New attestations on
          // either side after the split bump independently.
          usageCount: s.usageCount,
          productive: s.productive,
          establishedGeneration: s.establishedGeneration,
        })),
      culturalTier: parentLang.culturalTier,
      colexifiedAs: parentLang.colexifiedAs
        ? Object.fromEntries(
            Object.entries(parentLang.colexifiedAs).map(([k, v]) => [
              k,
              v.slice(),
            ]),
          )
        : undefined,
      variants: parentLang.variants
        ? Object.fromEntries(
            Object.entries(parentLang.variants).map(([k, list]) => [
              k,
              list.map((v) => ({
                form: v.form.slice(),
                weight: v.weight * 0.7,
                bornGeneration: v.bornGeneration,
              })),
            ]),
          )
        : undefined,
      // Phase 21a: deep-clone the parent's words table so each daughter
      // gets its own independent word entries (no shared refs).
      words: parentLang.words
        ? parentLang.words.map((w) => ({
            form: w.form.slice(),
            formKey: w.formKey,
            senses: w.senses.map((s) => ({ ...s })),
            primarySenseIndex: w.primarySenseIndex,
            bornGeneration: w.bornGeneration,
            origin: w.origin,
          }))
        : undefined,
    };
  };

  const childCount = opts.childCount ?? pickChildCount(rng);
  const children: Language[] = [];
  for (let i = 0; i < childCount; i++) {
    children.push(makeChild(i !== 0));
  }
  // Phase 29 Tranche 1e: each daughter's words[] is a fresh deep
  // clone — build a fresh form-key index against the new refs.
  for (const child of children) {
    if (child.words) rebuildFormKeyIndex(child);
  }
  // Phase 40c: sister differentiation. Each daughter gets a clone of
  // parent's diffusionState / categoryMomentum / naturalBiasOverride
  // with INDEPENDENT random jitter, so:
  //   - same inherited rule advances at slightly different ages in
  //     each sister (Wang sigmoid completes at different gens)
  //   - category-momentum boosts decay at different rates
  //   - per-language phonological preferences drift apart
  // Pre-40c daughters all converged to identical outcomes because
  // they ran the same rule set with identical state. Now they diverge
  // even when the inherited rules are unchanged.
  for (const child of children) {
    if (parentLang.diffusionState) {
      child.diffusionState = {};
      for (const [ruleId, entry] of Object.entries(parentLang.diffusionState)) {
        const jitter = rng.int(31) - 15; // ±15 gens
        child.diffusionState[ruleId] = {
          actuatedAt: entry.actuatedAt + jitter,
        };
      }
    }
    if (parentLang.categoryMomentum) {
      child.categoryMomentum = {};
      for (const [cat, m] of Object.entries(parentLang.categoryMomentum)) {
        const jitter = rng.int(11) - 5; // ±5 gens on the until window
        const boostJitter = (rng.next() - 0.5) * 0.1; // ±0.05 on boost
        child.categoryMomentum[cat] = {
          boost: Math.max(0.5, Math.min(2.0, m.boost + boostJitter)),
          until: m.until + jitter,
        };
      }
    }
    if (parentLang.naturalBiasOverride) {
      child.naturalBiasOverride = {};
      for (const [cat, mult] of Object.entries(parentLang.naturalBiasOverride)) {
        if (mult === undefined) continue;
        const jitter = (rng.next() - 0.5) * 0.1; // ±0.05
        child.naturalBiasOverride[cat as keyof typeof child.naturalBiasOverride]
          = Math.max(0.7, Math.min(1.3, mult + jitter));
      }
    }
  }
  for (const child of children) {
    child.lexicalCapacity = lexicalCapacity(child, generation);
  }

  const usedKinds = new Set<string>();
  // Phase 39l: sister-grammar dampening. Fresh daughters get a 30-gen
  // window where their grammar drift is dampened to 0.4× — modelling
  // the ~400-yr mutual-intelligibility window between Old English
  // and Old Saxon post-split. The flag is read by driftGrammar in
  // grammar/evolve.ts.
  for (const child of children) {
    child.siblingDriftDampenUntil = generation + 30;
  }
  for (const child of children) {
    const innovation = applyFounderInnovation(
      child,
      rng,
      generation,
      usedKinds.size >= 2 ? undefined : usedKinds,
    );
    if (innovation) {
      usedKinds.add(innovation.kind);
      child.events.push({
        generation,
        kind: innovation.kind === "phonology" ? "sound_change" : "grammar_shift",
        description: `founder innovation — ${innovation.description}`,
      });
    }
  }

  const parentCoords = parentLang.coords ?? { x: 0, y: 0 };
  const depth = depthOf(tree, parentId);
  const step = 80 / Math.sqrt(1 + depth);
  const baseAngle = fnv1aFloat(parentId + ":" + generation) * Math.PI * 2;
  for (let i = 0; i < childCount; i++) {
    const angle = baseAngle + (i / childCount) * Math.PI * 2 + (rng.next() - 0.5) * 0.4;
    children[i]!.coords = {
      x: parentCoords.x + Math.cos(angle) * step,
      y: parentCoords.y + Math.sin(angle) * step,
    };
  }
  if (opts.worldMap) {
    partitionTerritory(parentLang, children, opts.worldMap, rng);
  }

  const childIds: string[] = [];
  for (const child of children) {
    const node: LanguageNode = {
      language: child,
      parentId,
      childrenIds: [],
      splitGeneration: generation,
    };
    tree[child.id] = node;
    childIds.push(child.id);
  }
  parent.childrenIds = childIds;
  return childIds;
}
