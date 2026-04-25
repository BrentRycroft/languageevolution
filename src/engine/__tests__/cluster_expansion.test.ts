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

describe("§H.1 — cluster lookups span the expanded registry", () => {
  it("clusterOf resolves BASIC_240 meanings via the curated table", () => {
    // Sanity: existing BASIC_240 path still works.
    expect(clusterOf("water")).toBeDefined();
    expect(clusterOf("hand")).toBeDefined();
    expect(clusterOf("love")).toBe("abstract");
  });

  it("clusterOf resolves expansion meanings via the registry", () => {
    // The bug we just fixed: these returned undefined before.
    expect(clusterOf("democracy")).toBe("abstract");
    expect(clusterOf("computer")).toBeDefined();
    expect(clusterOf("vaccine")).toBeDefined();
    expect(clusterOf("internet")).toBeDefined();
  });

  it("SEMANTIC_CLUSTERS includes every registered concept's cluster", () => {
    // Every concept's cluster name is reachable via SEMANTIC_CLUSTERS.
    for (const [id, c] of Object.entries(CONCEPTS)) {
      const members = SEMANTIC_CLUSTERS[c.cluster];
      expect(members, `cluster ${c.cluster} for ${id}`).toBeDefined();
      expect(members!.includes(id), `${id} in ${c.cluster}`).toBe(true);
    }
  });

  it("relatedMeanings returns cluster-mates for an expansion concept", () => {
    // democracy lives in the abstract cluster; should pull mates like
    // law / king / people / power, etc.
    const related = relatedMeanings("democracy");
    expect(related.length).toBeGreaterThan(5);
    // All returned ids should also be abstract-cluster concepts (the
    // static neighbor table contributes none for this id).
    for (const m of related) {
      expect(clusterOf(m)).toBe("abstract");
    }
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
    // Spin up a real proto language so we have a complete Language
    // object, then manually populate its lexicon with abstract-cluster
    // words and ask compound to coin "democracy".
    const sim = createSimulation({ ...defaultConfig(), seed: "compound-democracy" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.culturalTier = 3;
    // Seed an abstract-flavoured pocket of vocabulary for the compound
    // pool to draw from. Forms are arbitrary but legal.
    lang.lexicon["people"] = ["p", "e", "o"];
    lang.lexicon["law"] = ["l", "a", "w"];
    lang.lexicon["king"] = ["k", "i", "n"];
    lang.lexicon["power" as string] = ["p", "o", "w"];
    delete lang.lexicon["democracy"];

    const rng = makeRng("compound-democracy-seed");
    let coined = 0;
    for (let i = 0; i < 30; i++) {
      const out = MECHANISM_COMPOUND.tryCoin(lang, "democracy", {} as never, rng);
      if (out) coined++;
    }
    // It should succeed at least some of the time — the cluster pool
    // is non-empty, so the random part-picker has real candidates.
    expect(coined).toBeGreaterThan(0);
  });

  it("drift can target an expansion concept via cluster gravity", () => {
    // Build a small lexicon entirely from abstract-cluster BASIC_240
    // members. democracy is in the same cluster, so relatedMeanings
    // for any of these words should include it — and drift should
    // therefore be able to land a form into the democracy slot.
    const sim = createSimulation({ ...defaultConfig(), seed: "drift-democracy" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.culturalTier = 3;
    // Replace lexicon with a tightly clustered abstract pocket. Use
    // multi-syllable forms so isFormLegal accepts them everywhere.
    lang.lexicon = {
      people: ["p", "e", "o", "p", "l"],
      law: ["l", "a", "w", "a"],
      king: ["k", "i", "n", "g"],
      gift: ["g", "i", "f", "t"],
      truth: ["t", "r", "u", "θ"],
    } as never;
    // Leave democracy slot empty so drift can settle there.
    const rng = makeRng("drift-democracy-seed");
    // Loop drift attempts. Even with stochastic skips (register +
    // coreness) we should hit democracy within a few hundred tries.
    let landed = false;
    for (let i = 0; i < 500; i++) {
      const ev = driftOneMeaning(lang, rng);
      if (ev?.to === "democracy") {
        landed = true;
        break;
      }
    }
    expect(landed).toBe(true);
  });
});
