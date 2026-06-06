import { describe, expect, it } from "vitest";
import {
  SEMANTIC_CLUSTERS,
  clusterOf,
  relatedMeanings,
} from "../semantics/clusters";
import { CONCEPTS } from "../lexicon/concepts";
import { MECHANISM_COMPOUND } from "../genesis/mechanisms/compound";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { makeRng } from "../rng";
import { driftOneMeaning } from "../semantics/drift";
import { lexSet, lexDelete } from "../lexicon/access";

/**
 * cluster_expansion.test.ts
 *
 * Test suite for: "§H.1 — cluster lookups span the expanded registry".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

describe("§H.1 — cluster lookups span the expanded registry", () => {
  it("clusterOf resolves BASIC_240 meanings to a defined field (now geometric)", () => {
    // Vector-native flip (full cluster switch): clusterOf reads the nearest cluster centroid by
    // geometry for grounded meanings, so the specific field NAME is no longer the curated value
    // (e.g. "love" need not land in "abstract"). The surviving invariant: every grounded core
    // meaning resolves to SOME valid cluster.
    expect(clusterOf("water")).toBeDefined();
    expect(clusterOf("hand")).toBeDefined();
    expect(clusterOf("love")).toBeDefined();
  });

  it("clusterOf resolves expansion meanings via the registry", () => {
    expect(clusterOf("democracy")).toBe("abstract");
    expect(clusterOf("computer")).toBeDefined();
    expect(clusterOf("vaccine")).toBeDefined();
    expect(clusterOf("internet")).toBeDefined();
  });

  it("SEMANTIC_CLUSTERS includes every registered concept's cluster", () => {
    for (const [id, c] of Object.entries(CONCEPTS)) {
      const members = SEMANTIC_CLUSTERS[c.cluster];
      expect(members, `cluster ${c.cluster} for ${id}`).toBeDefined();
      expect(members!.includes(id), `${id} in ${c.cluster}`).toBe(true);
    }
  });

  it("relatedMeanings returns a non-empty related set for an expansion concept", () => {
    // Post-flip, relatedMeanings unions the geometric cluster-mates with the geometric NEIGHBOURS,
    // so members no longer all share one curated field name (the old all-"abstract" assertion is
    // void under geometry). The surviving invariant: a grounded expansion concept has a substantive
    // related set and does not include itself.
    const related = relatedMeanings("democracy");
    expect(related.length).toBeGreaterThan(5);
    expect(related).not.toContain("democracy");
  });

  it("relatedMeanings is non-empty for every tier-2/3 expansion concept", () => {
    let empty = 0;
    for (const id of Object.keys(CONCEPTS)) {
      const c = CONCEPTS[id]!;
      if (c.tier < 2) continue;
      if (relatedMeanings(id).length === 0) empty++;
    }
    expect(empty).toBe(0);
  });

  it("compound mechanism finds semantically-related parts for an expansion target", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "compound-democracy" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.culturalTier = 3;
    lexSet(lang, "people", ["p", "e", "o"]);
    lexSet(lang, "law", ["l", "a", "w"]);
    lexSet(lang, "king", ["k", "i", "n"]);
    lexSet(lang, "power", ["p", "o", "w"]);
    lexDelete(lang, "democracy");

    const rng = makeRng("compound-democracy-seed");
    let coined = 0;
    for (let i = 0; i < 30; i++) {
      const out = MECHANISM_COMPOUND.tryCoin(lang, "democracy", {} as never, rng);
      if (out) coined++;
    }
    expect(coined).toBeGreaterThan(0);
  });

  it("drift can target an expansion concept via cluster gravity", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "drift-democracy" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.culturalTier = 3;
    lang.lexicon = {} as never;
    lang.lexemeIds = {};
    lexSet(lang, "people", ["p", "e", "o", "p", "l"]);
    lexSet(lang, "law", ["l", "a", "w", "a"]);
    lexSet(lang, "king", ["k", "i", "n", "g"]);
    lexSet(lang, "gift", ["g", "i", "f", "t"]);
    lexSet(lang, "truth", ["t", "r", "u", "θ"]);
    const rng = makeRng("drift-democracy-seed");
    const seeded = new Set(["people", "law", "king", "gift", "truth"]);
    const reached = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const ev = driftOneMeaning(lang, rng);
      if (ev?.to && !seeded.has(ev.to)) reached.add(ev.to);
    }
    // Cluster gravity carries drift beyond the seeded political words into related
    // registry (expansion) concepts. The exact concept reached depends on the
    // distributional embedding, so we assert the MECHANISM — drift reaches new
    // concepts outside the seed — rather than hardcoding one target ("democracy"),
    // which the old 12-dim centroid table happened to favour.
    expect(reached.size).toBeGreaterThan(0);
  });
});
