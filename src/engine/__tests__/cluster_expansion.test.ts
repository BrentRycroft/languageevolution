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
    expect(clusterOf("water")).toBeDefined();
    expect(clusterOf("hand")).toBeDefined();
    expect(clusterOf("love")).toBe("abstract");
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

  it("relatedMeanings returns cluster-mates for an expansion concept", () => {
    const related = relatedMeanings("democracy");
    expect(related.length).toBeGreaterThan(5);
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
    const sim = createSimulation({ ...defaultConfig(), seed: "compound-democracy" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.culturalTier = 3;
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
    expect(coined).toBeGreaterThan(0);
  });

  it("drift can target an expansion concept via cluster gravity", () => {
    const sim = createSimulation({ ...defaultConfig(), seed: "drift-democracy" });
    sim.step();
    const lang = sim.getState().tree["L-0"]!.language;
    lang.culturalTier = 3;
    lang.lexicon = {
      people: ["p", "e", "o", "p", "l"],
      law: ["l", "a", "w", "a"],
      king: ["k", "i", "n", "g"],
      gift: ["g", "i", "f", "t"],
      truth: ["t", "r", "u", "θ"],
    } as never;
    const rng = makeRng("drift-democracy-seed");
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
