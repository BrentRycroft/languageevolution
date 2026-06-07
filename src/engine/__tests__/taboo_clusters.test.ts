import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { maybeTabooReplace } from "../lexicon/taboo";
import { clusterOf, relatedMeanings } from "../semantics/clusters";
import { isExpressive } from "../lexicon/expressive";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import type { Language } from "../types";
import { lexGet, lexSize, lexSet } from "../lexicon/access";
import { satGet } from "../lexicon/satellites";

/**
 * taboo_clusters.test.ts
 *
 * Test suite for: "semantic clusters".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

describe("semantic clusters", () => {
  it("core meanings resolve to a defined semantic field (geometric, fields may scatter)", () => {
    // Vector-native flip (full cluster switch, user-authorized): clusterOf now reads the nearest
    // cluster centroid by GloVe geometry, which DISAGREES with the curated field names (~59% parity)
    // and scatters some coherent fields — e.g. body parts no longer all land in "body". This is an
    // accepted, reversible trade-off (the curated `MEANING_TO_CLUSTER` table remains the canonical
    // source). The surviving invariant: every grounded core meaning resolves to SOME valid field.
    for (const m of ["hand", "foot", "water", "go"] as const) {
      expect(clusterOf(m), m).toBeDefined();
    }
  });

  it("relatedMeanings returns cluster-mates for seed meanings", () => {
    const related = relatedMeanings("water");
    expect(related.length).toBeGreaterThan(0);
    expect(related).toContain("fire");
  });

  it("unknown meanings get empty result (no crash)", () => {
    expect(relatedMeanings("unknown-word")).toEqual([]);
  });
});

describe("expressive phonology", () => {
  it("reduplicated intensifier forms are tagged expressive", () => {
    expect(isExpressive("big-intens")).toBe(true);
  });

  it("ordinary lexicon words are not expressive", () => {
    expect(isExpressive("water")).toBe(false);
    expect(isExpressive("hand")).toBe(false);
  });
});

describe("taboo replacement", () => {
  function makeLang(overrides: Partial<Language> = {}): Language {
    const lang: Language = {
      id: "L-0",
      name: "Proto",
      lexemes: {},
      lexemeIds: {},
      enabledChangeIds: [],
      changeWeights: {},
      birthGeneration: 0,
      grammar: { ...DEFAULT_GRAMMAR },
      events: [],
      // Evolution-realism Phase 3d: taboo targets dangerous REFERENTS, not
      // high-freq words. `snake` (a predator) is the eligible target here;
      // mother/father/hand/foot are present as the surrounding lexicon /
      // potential euphemism donors.
      wordFrequencyHints: { mother: 0.95, father: 0.95, hand: 0.9, foot: 0.9, snake: 0.6 } as Record<string, number>,
      phonemeInventory: { segmental: [], tones: [], usesTones: false },
      morphology: { paradigms: {} },
      localNeighbors: {},
      conservatism: 1,
      wordOrigin: {},
      activeRules: [],
      orthography: {}, otRanking: [], lastChangeGeneration: {},
      ...overrides,
    };
    lexSet(lang, "mother", ["m", "a", "m", "a"]);
    lexSet(lang, "father", ["t", "a", "t", "a"]);
    lexSet(lang, "hand", ["m", "a", "n", "u"]);
    lexSet(lang, "foot", ["p", "e", "d"]);
    lexSet(lang, "snake", ["n", "a", "g", "a"]);
    return lang;
  }

  it("does nothing when probability is 0", () => {
    const lang = makeLang();
    const rng = makeRng("off");
    const ev = maybeTabooReplace(lang, rng, 0);
    expect(ev).toBeNull();
  });

  it("replaces a taboo-referent form and tags origin as taboo", () => {
    const lang = makeLang();
    const rng = makeRng("force");
    const before = lexSize(lang);
    const ev = maybeTabooReplace(lang, rng, 1);
    expect(ev).not.toBeNull();
    if (!ev) return;
    // Phase 3d: the eligible target is the dangerous referent, not a
    // high-freq kinship/body word.
    expect(ev.meaning).toBe("snake");
    expect(lexSize(lang)).toBe(before);
    expect(lexGet(lang, ev.meaning)!.join("")).not.toBe(ev.oldForm);
    expect(satGet(lang, "wordOrigin", ev.meaning)).toMatch(/^taboo:/);
  });

  it("tagged meanings keep a new form shorter than 10 phonemes", () => {
    const lang = makeLang();
    const rng = makeRng("length");
    const ev = maybeTabooReplace(lang, rng, 1);
    if (ev) {
      expect(lexGet(lang, ev.meaning)!.length).toBeLessThanOrEqual(9);
    }
  });
});

describe("simulation end-to-end with clusters + taboo + expressive", () => {
  // Heavyweight: 600 generations of a full default simulation (growing
  // tree) takes minutes. Gated behind RUN_SLOW so the default suite stays
  // fast; CI / pre-push runs the full surface via `npm run test:slow`.
  it.skipIf(!RUN_SLOW)("produces at least one taboo event in 600 generations", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "taboo-probe" });
    for (let i = 0; i < 600; i++) sim.step();
    const events = Object.values(sim.getState().tree).flatMap(
      (n) => n.language.events,
    );
    const tabooEvents = events.filter((e) => e.description.startsWith("taboo:"));
    expect(tabooEvents.length).toBeGreaterThan(0);
  });
});
