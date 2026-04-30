import { describe, it, expect } from "vitest";
import { narrowTranscribe } from "../phonology/narrow";

describe("narrowTranscribe", () => {
  it("renders /korpus/ as [ˈkɔr.pʊs]", () => {
    expect(narrowTranscribe(["k", "o", "r", "p", "u", "s"])).toBe("ˈkɔr.pʊs");
  });

  it("laxes mid/high vowels: /mela/ → ˈmɛ.la", () => {
    expect(narrowTranscribe(["m", "e", "l", "a"])).toBe("ˈmɛ.la");
  });

  it("treats /a/ as already lax (no further laxing)", () => {
    expect(narrowTranscribe(["w", "a", "t", "a", "r"])).toBe("ˈwa.tar");
  });

  it("stress mark fires only on multi-syllable words", () => {
    expect(narrowTranscribe(["t", "a"])).toBe("ta");
  });

  it("splits an inter-vocalic CC cluster: /aCCa/ → a.CCa (max-onset)", () => {
    expect(narrowTranscribe(["a", "p", "t", "a"])).toBe("ˈap.ta");
  });

  it("handles syllabic resonants as nuclei", () => {
    expect(narrowTranscribe(["s", "t", "r̩", "k"])).toBe("str̩k");
  });

  it("preserves IPA diacritics on the nucleus (length, aspiration)", () => {
    const out = narrowTranscribe(["bʰ", "r", "aː", "t", "eː", "r"]);
    expect(out).toContain("bʰ");
    expect(out).toContain("aː");
    expect(out).toContain("ɛː");
  });
});
