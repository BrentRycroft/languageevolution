import { describe, it, expect } from "vitest";
import { embed, cosine, nearestMeanings, EMBEDDING_DIMS } from "../semantics/embeddings";

/**
 * embeddings.test.ts
 *
 * Test suite for: "semantic embeddings".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

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
    // Nature/environment neighbours (fire, stone, tree) should dominate the top 3 and
    // "fire" should rank above the unrelated number "one". With the real GloVe-50
    // embedding the high-frequency token "one" sits moderately close to many words, so
    // the previous strict "one never appears" assertion was a 12-dim-centroid artifact;
    // what matters is that the related cluster wins, which it still does.
    expect(nn).toContain("fire");
    const nature = nn.filter((m) => ["fire", "stone", "tree"].includes(m));
    expect(nature.length).toBeGreaterThanOrEqual(2);
    if (nn.includes("one")) {
      expect(nn.indexOf("fire")).toBeLessThan(nn.indexOf("one"));
    }
  });

  it("compounds inherit a blended vector", () => {
    const v1 = embed("foot");
    const vCompound = embed("foot-ball");
    expect(cosine(v1, vCompound)).toBeGreaterThan(0);
  });
});
