import type { Language, TypologicalDirection } from "../types";
import type { Rng } from "../rng";
import type { GeneratedRule } from "../phonology/generated-types";

/**
 * inventoryExpansion.ts — Phase 73d Tier D Phase D4.
 *
 * Closes the asymmetry where `refreshInventory` (steps/helpers.ts)
 * only ever LOSES phonemes (when a contrast becomes unattested in
 * the lexicon). Founder events can now ADD a phoneme series:
 * retroflexes, palatalized stops, aspirated stops, voiced-aspirated
 * stops, ejectives, pharyngeals. The series enters via a
 * `GeneratedRule` that promotes a contextual allophone (e.g.
 * `k → kʲ / _i`); when the rule fires across the lexicon,
 * `refreshInventory` reads the new phonemes back into
 * `segmental` naturally.
 *
 * Selection is direction-weighted:
 *   - palatalization-positive daughters → palatalized series 3×
 *   - simplification-negative + palatalization-positive → retroflex
 *     possible (Indo-Iranian-style)
 *   - simplification-negative ⇒ aspirated / voiced-aspirated (PIE-
 *     style retention)
 *   - simplification-negative + extra ⇒ ejective (Caucasian-style)
 *
 * Each series declares a `baseQuery`: the parent inventory must
 * already contain the base phonemes for the series to be eligible
 * (palatalized requires velars; voiced-aspirated requires voiced
 * stops; etc.). Daughters with depleted inventories can't
 * arbitrarily acquire features they have no foothold for.
 *
 * Cap: inventory total ≤ `phonemeTarget + 8` to prevent runaway
 * expansion.
 */

const EXPANSION_PROBABILITY = 0.18;
const INVENTORY_CAP_HEADROOM = 8;

interface PhonemeSeries {
  id: string;
  /** New phonemes to introduce. */
  added: ReadonlyArray<string>;
  /** Phonemes the parent must already have (any one suffices). */
  baseAny: ReadonlyArray<string>;
  /** Output map for the synthesised rule: input → output. */
  outputMap: Record<string, string>;
  /** Rule family for the synthesised rule. */
  family: GeneratedRule["family"];
  /** Direction-weighted preference function. */
  weight: (d: TypologicalDirection) => number;
  /** Short human-readable description for the event log. */
  description: string;
}

const SERIES_CATALOG: ReadonlyArray<PhonemeSeries> = [
  {
    id: "palatalized",
    added: ["kʲ", "gʲ", "tʲ", "dʲ"],
    baseAny: ["k", "g", "t", "d"],
    outputMap: { k: "kʲ", g: "gʲ", t: "tʲ", d: "dʲ" },
    family: "palatalization",
    weight: (d) => Math.max(0.1, 1 + 2 * d.palatalization),
    description: "palatalized stop series",
  },
  {
    id: "aspirated",
    added: ["pʰ", "tʰ", "kʰ"],
    baseAny: ["p", "t", "k"],
    outputMap: { p: "pʰ", t: "tʰ", k: "kʰ" },
    family: "fortition",
    weight: (d) => Math.max(0.1, 1 - 1.5 * d.simplification),
    description: "aspirated stop series",
  },
  {
    id: "voiced_aspirated",
    added: ["bʰ", "dʰ", "gʰ"],
    baseAny: ["b", "d", "g"],
    outputMap: { b: "bʰ", d: "dʰ", g: "gʰ" },
    family: "fortition",
    weight: (d) => Math.max(0.1, 1 - 2 * d.simplification),
    description: "voiced-aspirated stop series",
  },
  {
    id: "retroflex",
    added: ["ʈ", "ɖ", "ɳ"],
    baseAny: ["t", "d", "n"],
    outputMap: { t: "ʈ", d: "ɖ", n: "ɳ" },
    family: "fortition",
    weight: (d) => Math.max(0.1, 0.5 + 0.6 * d.palatalization - 0.8 * d.simplification),
    description: "retroflex stop series",
  },
  {
    id: "ejective",
    added: ["pʼ", "tʼ", "kʼ"],
    baseAny: ["p", "t", "k"],
    outputMap: { p: "pʼ", t: "tʼ", k: "kʼ" },
    family: "fortition",
    weight: (d) => Math.max(0.05, 0.4 - 1.0 * d.simplification),
    description: "ejective stop series",
  },
  {
    id: "pharyngeal",
    added: ["ħ", "ʕ"],
    baseAny: ["h", "ʔ", "x"],
    outputMap: { h: "ħ" },
    family: "fortition",
    weight: () => 0.15,
    description: "pharyngeal series",
  },
];

function pickSeries(
  direction: TypologicalDirection,
  parentInventory: ReadonlyArray<string>,
  rng: Rng,
): PhonemeSeries | null {
  const eligible = SERIES_CATALOG.filter((s) =>
    s.baseAny.some((p) => parentInventory.includes(p)),
  );
  if (eligible.length === 0) return null;
  const weights = eligible.map((s) => s.weight(direction));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (let i = 0; i < eligible.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return eligible[i]!;
  }
  return eligible[eligible.length - 1]!;
}

/**
 * Roll an inventory expansion. Returns the description of what
 * was added, or null if no expansion fired.
 *
 * Side effects on `child`:
 *   - appends a `GeneratedRule` to `child.activeRules`
 *   - tags each added phoneme in `child.inventoryProvenance` with
 *     source `"founder-addition"`
 *
 * The new phonemes only enter `child.phonemeInventory.segmental`
 * once the rule fires across the lexicon AND `refreshInventory`
 * observes them; this commit lays the seed without front-loading.
 */
export function maybeExpandInventory(
  child: Language,
  direction: TypologicalDirection | undefined,
  rng: Rng,
  generation: number,
): string | null {
  if (!direction) return null;
  if (!rng.chance(EXPANSION_PROBABILITY)) return null;
  const parentInv = child.phonemeInventory.segmental;
  const cap = (child.phonemeTarget ?? parentInv.length) + INVENTORY_CAP_HEADROOM;
  if (parentInv.length >= cap) return null;

  const series = pickSeries(direction, parentInv, rng);
  if (!series) return null;

  // Filter outputMap to keys whose source phoneme is actually in
  // the parent inventory. Without that, the rule has nothing to
  // operate on.
  const filteredOutput: Record<string, string> = {};
  for (const [src, dst] of Object.entries(series.outputMap)) {
    if (parentInv.includes(src)) filteredOutput[src] = dst;
  }
  if (Object.keys(filteredOutput).length === 0) return null;

  // Install the rule. Context: prefer high-vowel environment for
  // palatalization, edge environment for fortition. Simpler default:
  // intervocalic / any — let the rule fire opportunistically.
  const rule: GeneratedRule = {
    id: `${child.id}.g${generation}.founder.${series.id}`,
    family: series.family,
    templateId: `founder-${series.id}`,
    description: `${series.description} (founder)`,
    birthGeneration: generation,
    lastFireGeneration: generation,
    strength: 0.6,
    from: { type: "consonant" },
    context: { locus: series.id === "palatalized" ? "any" : "any" },
    outputMap: filteredOutput,
  };
  child.activeRules = child.activeRules ?? [];
  child.activeRules.push(rule);

  // Tag provenance for the phonemes the rule will introduce. They
  // don't appear in segmental yet — refreshInventory adds them
  // when they're attested in the lexicon.
  child.inventoryProvenance = child.inventoryProvenance ?? {};
  for (const dst of Object.values(filteredOutput)) {
    if (!child.inventoryProvenance[dst]) {
      child.inventoryProvenance[dst] = {
        source: "founder-addition",
        generation,
      };
    }
  }

  return series.description;
}
