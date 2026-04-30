import type { Language, LanguageNode, LanguageTree } from "../types";
import { CATALOG, CATALOG_BY_ID } from "../phonology/catalog";
import { generateName } from "../naming";
import { cloneLexicon, cloneGrammar, cloneMorphology } from "../utils/clone";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";
import { fnv1a } from "../rng";
import type { Rng } from "../rng";
import { lexicalCapacity } from "../lexicon/tier";
import { partitionTerritory } from "../geo/territory";
import type { WorldMap } from "../geo/map";
import { leafIds } from "./leafIds";
import { CONSERVATISM_MIN, CONSERVATISM_MAX } from "../constants";

// Re-export for backwards compatibility — many call-sites import leafIds
// from `tree/split`. The implementation now lives in `tree/leafIds.ts`
// so `geo/territory.ts` and `lexicon/tier.ts` can use it without
// creating an import cycle through this file.
export { leafIds };

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

/**
 * Float in [0, 1) derived from `fnv1a`. Local helper since `rng.ts`
 * exports the integer hash but not the normalised float form.
 */
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

/**
 * Pick how many daughters this split produces. Most splits are binary
 * (two languages diverging from a common ancestor); occasionally a
 * proto-community fragments into three, four, or rarely more lineages
 * at once (cf. the Austronesian dispersals or the Proto-Germanic →
 * East/West/North Germanic break-up). Bias heavily low so the average
 * tree still looks mostly binary, with rare bursts of polytomy.
 */
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

/**
 * Distribution used for the proto-language's *first* split — the
 * bootstrap event that breaks the proto into its initial daughters.
 * A proto-dispersal never goes strictly binary in practice (Proto-
 * Austronesian → 10+ primary branches; Proto-Bantu → 3–4; even the
 * most constrained families show multi-way primary splits), so we
 * start at three:
 *
 *   3 / 4     — normal           (75 % combined)
 *   5 / 6 / 7 — rare             (23 % combined)
 *   8         — exceedingly rare (2 %)
 *
 * Capped at 8 to keep the bootstrap from producing genuinely unusual
 * 9-way splits.
 */
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
  /**
   * Override the child-count sampler. Used by the bootstrap split
   * (`firstSplit`) to pull from a wider distribution than the default
   * binary-dominant one. Any positive integer works.
   */
  childCount?: number;
  /**
   * World map context. When passed, the parent's territory is
   * partitioned among the daughters; the legacy coord-fanout layout
   * still runs for back-compat callers (tests, pre-territory saves)
   * but the territory partition takes precedence and overwrites the
   * fanout coords.
   */
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
      // Daughters inherit parent's tempo with ±30% jitter, clamped to
      // [CONSERVATISM_MIN, CONSERVATISM_MAX]. Sister languages frequently
      // diverge in tempo as well as form — one becomes the "turtle",
      // the other the "hare".
      conservatism: Math.max(
        CONSERVATISM_MIN,
        Math.min(CONSERVATISM_MAX, parentLang.conservatism * (0.7 + rng.next() * 0.6)),
      ),
      // Daughters inherit parent's speaker count × a log-normal
      // fragmentation factor. When a community breaks up, each
      // daughter gets a random fraction of the original pool —
      // typically 30 – 120 % of parent / N, with heavy tails so some
      // daughters end up tiny (drive fast innovation) and others
      // inherit the bulk (conservative giants). Empirically: Vulgar
      // Latin → huge Romance daughters on the empire's former core
      // territory, tiny ones in isolated pockets like Romansh.
      speakers: Math.max(
        50,
        Math.round(
          ((parentLang.speakers ?? 10000) / 3) * (0.3 + rng.next() * 1.7),
        ),
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
      // Stress pattern is inherited; daughters only diverge on this
      // axis through the grammar-drift step, not at split time.
      stressPattern: parentLang.stressPattern,
      // Lexical-stress overrides (PIE mobile accent) inherit too.
      // Daughters can later drift off `lexical` to a fixed pattern;
      // the override map is then ignored but kept for cognate trace.
      lexicalStress: parentLang.lexicalStress
        ? { ...parentLang.lexicalStress }
        : undefined,
      // Suppletion tables are deep-cloned so daughter paradigms can
      // diverge independently. The whole map is usually tiny (a
      // handful of verbs), so the copy cost is negligible.
      suppletion: parentLang.suppletion
        ? Object.fromEntries(
            Object.entries(parentLang.suppletion).map(([m, slots]) => [
              m,
              { ...slots },
            ]),
          )
        : undefined,
      // Daughters inherit the parent's productive derivational
      // suffixes but each drops a random ~20% so sisters diverge in
      // which derivational routes remain productive. The universal
      // catalog fallback still exists, so a daughter with zero
      // inherited suffixes isn't stranded.
      derivationalSuffixes: (parentLang.derivationalSuffixes ?? [])
        .filter(() => rng.chance(0.8))
        .map((s) => ({ affix: s.affix.slice(), tag: s.tag })),
      // Cultural tier inherits from the parent (daughters start at
      // the same material-culture stage) but the capacity resets to
      // the daughter's own profile — if the daughter got a much
      // smaller speaker share, its target capacity is lower too.
      culturalTier: parentLang.culturalTier,
      // lexicalCapacity is filled in after construction so it can
      // read speakers + birthGeneration off the daughter itself.
      // Re-carved concept slots stay with the daughter that inherited
      // them — the merge already happened, sisters can re-carve on
      // their own later.
      colexifiedAs: parentLang.colexifiedAs
        ? Object.fromEntries(
            Object.entries(parentLang.colexifiedAs).map(([k, v]) => [
              k,
              v.slice(),
            ]),
          )
        : undefined,
    };
  };

  const childCount = opts.childCount ?? pickChildCount(rng);
  // First daughter inherits the parent's change set verbatim (keeps the
  // conservative branch); the rest perturb so sisters diverge from the
  // first generation on.
  const children: Language[] = [];
  for (let i = 0; i < childCount; i++) {
    children.push(makeChild(i !== 0));
  }
  // Now that each daughter has its own birthGeneration + speakers,
  // compute a fresh lexicalCapacity target. Daughters with smaller
  // populations get proportionally smaller capacity, so fragmented
  // communities don't feel compelled to coin their parent's full
  // vocabulary overnight.
  for (const child of children) {
    child.lexicalCapacity = lexicalCapacity(child, generation);
  }

  // Persistent map coordinates: fan the daughters evenly around the
  // parent, with a deterministic base angle so the layout doesn't
  // jump around if you rerun the same split. Per-daughter jitter keeps
  // sister clusters from sitting in perfect regular polygons. Step
  // size decays with tree depth so deeper splits stay visually
  // grouped.
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
  // Territory partition overrides the legacy fanout when the caller
  // supplied a world map. Each daughter ends up with a contiguous-or-
  // close-to-it cell list; coords are recomputed as the centroid.
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
