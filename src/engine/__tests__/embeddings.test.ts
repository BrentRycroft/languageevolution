import { describe, it, expect } from "vitest";
import { embed, cosine, nearestMeanings, EMBEDDING_DIMS } from "../semantics/embeddings";

describe("semantic embeddings", () => {
  it("every seed meaning embeds into a vector of the declared size", () => {
    const v = embed("water");
    expect(v.length).toBe(EMBEDDING_DIMS);
  });

  it("body-part meanings cluster closer to each other than to environment", () => {
    const sim_body = cosine(embed("hand"), embed("foot"));
    const sim_cross = cosine(embed("hand"), embed("fire"));
    expect(sim_body).toBeGreaterThan(sim_cross);
  });

  it("animals cluster closer to each other than to numbers", () => {
    expect(cosine(embed("dog"), embed("wolf"))).toBeGreaterThan(
      cosine(embed("dog"), embed("three")),
    );
  });

  it("good and bad are opposites along the evaluation dimension", () => {
    expect(cosine(embed("good"), embed("bad"))).toBeLessThan(0);
  });

  it("nearestMeanings returns in-cluster choices first", () => {
    const nn = nearestMeanings("water", ["fire", "dog", "one", "stone", "tree"], 3);
    // Environment cluster-mates should dominate.
    expect(nn).toContain("fire");
    expect(nn.slice(0, 3)).not.toContain("one");
  });

  it("compounds inherit a blended vector", () => {
    const v1 = embed("foot");
    const vCompound = embed("foot-ball");
    // Compound should be reasonably similar to its first component.
    expect(cosine(v1, vCompound)).toBeGreaterThan(0);
  });
});
