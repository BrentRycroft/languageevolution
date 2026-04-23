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
    // `a` stays `a`; the only laxed vowels are /e i o u/.
    expect(narrowTranscribe(["w", "a", "t", "a", "r"])).toBe("ˈwa.tar");
  });

  it("stress mark fires only on multi-syllable words", () => {
    // A single-syllable form has no syllable break, so the `ˈ` is
    // elided — it's redundant when there's only one syllable.
    expect(narrowTranscribe(["t", "a"])).toBe("ta");
  });

  it("splits an inter-vocalic CC cluster: /aCCa/ → a.CCa (max-onset)", () => {
    // Four phonemes: a-p-t-a. Between vowels: two consonants. Split
    // one coda + one onset by default → `ap.ta`.
    expect(narrowTranscribe(["a", "p", "t", "a"])).toBe("ˈap.ta");
  });

  it("handles syllabic resonants as nuclei", () => {
    // /str̩k/ — /r̩/ is a syllabic resonant, so it anchors a syllable
    // without needing a vowel.
    expect(narrowTranscribe(["s", "t", "r̩", "k"])).toBe("str̩k");
  });

  it("preserves IPA diacritics on the nucleus (length, aspiration)", () => {
    // Long vowels pass through; aspiration on the onset passes
    // through; long mid vowels lax (eː → ɛː, oː → ɔː) because the
    // narrow renderer strips the length mark, laxes the base, and
    // re-attaches the length.
    const out = narrowTranscribe(["bʰ", "r", "aː", "t", "eː", "r"]);
    expect(out).toContain("bʰ");
    expect(out).toContain("aː");
    expect(out).toContain("ɛː");
  });
});
