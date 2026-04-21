import { describe, it, expect } from "vitest";
import { stripTone, toneOf, HIGH, LOW } from "../phonology/tone";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

describe("tone helpers", () => {
  it("stripTone removes a trailing tone mark", () => {
    expect(stripTone(`a${HIGH}`)).toBe("a");
    expect(stripTone(`e${LOW}`)).toBe("e");
    expect(stripTone("a")).toBe("a");
  });

  it("toneOf reports the mark or null", () => {
    expect(toneOf(`a${HIGH}`)).toBe(HIGH);
    expect(toneOf("a")).toBe(null);
  });
});

describe("tonogenesis rule", () => {
  it("applies a low tone after a voiced coda", () => {
    const rule = CATALOG_BY_ID["tonogenesis.voiced_coda"]!;
    const rng = makeRng("test");
    const word = ["w", "a", "d"];
    const out = rule.apply(word, rng);
    expect(toneOf(out[out.length - 2] ?? "")).toBe(LOW);
  });

  it("applies a high tone after a voiceless coda", () => {
    const rule = CATALOG_BY_ID["tonogenesis.voiced_coda"]!;
    const rng = makeRng("test");
    const word = ["w", "a", "t"];
    const out = rule.apply(word, rng);
    expect(toneOf(out[out.length - 2] ?? "")).toBe(HIGH);
  });
});
