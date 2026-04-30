import { describe, it, expect } from "vitest";
import { translateSentence } from "../translator/sentence";
import { reverseTranslate } from "../translator/reverse";
import { presetPIE } from "../presets/pie";
import { createSimulation } from "../simulation";

const sim = createSimulation(presetPIE());
sim.step();
const lang = sim.getState().tree["L-0"]!.language;

function reverseRecovers(english: string, expectedLemmas: string[]): string[] {
  const fwd = translateSentence(lang, english);
  const targetSurface = fwd.targetTokens
    .map((t) => t.targetSurface)
    .filter(Boolean)
    .join(" ");
  const rev = reverseTranslate(lang, targetSurface);
  const recovered = rev.tokens
    .map((t) => t.lemma)
    .filter((l): l is string => l !== null);
  const missing = expectedLemmas.filter((l) => !recovered.includes(l));
  return missing;
}

describe("translator round-trip (forward → reverse)", () => {
  it("recovers content lemmas for SVO sentences", () => {
    expect(reverseRecovers("the king sees the wolf", ["king", "wolf", "see"])).toEqual([]);
  });

  it("recovers content lemmas for past-tense action verbs", () => {
    expect(reverseRecovers("the king did it", ["king", "do", "it"])).toEqual([]);
  });

  it("recovers content lemmas for past-tense perception verbs", () => {
    expect(reverseRecovers("the king saw the wolf", ["king", "wolf", "see"])).toEqual([]);
  });

  it("recovers content lemmas for possessive 's", () => {
    expect(reverseRecovers("the king's wolf runs", ["king", "wolf", "run"])).toEqual([]);
  });

  it("recovers content lemmas for relative clauses", () => {
    expect(
      reverseRecovers("the king who sees the wolf attacks", ["king", "wolf", "see", "who"]),
    ).toEqual([]);
  });

  it("recovers content lemmas for fragment input (NP coordination)", () => {
    expect(reverseRecovers("fire and water", ["fire", "water", "and"])).toEqual([]);
  });

  it("recovers content lemmas for negated past sentences", () => {
    expect(reverseRecovers("It did not have that", ["it", "not"])).toEqual([]);
  });

  it("recovers quoted-fallback lemmas", () => {
    expect(reverseRecovers("the wise king attacks", ["wise", "king"])).toEqual([]);
  });

  it("emits a non-empty english string for any non-empty target", () => {
    for (const s of [
      "the king sees the wolf",
      "the wolf runs",
      "fire and water",
      "the king did it",
      "i have a horse",
    ]) {
      const fwd = translateSentence(lang, s);
      const targetSurface = fwd.targetTokens
        .map((t) => t.targetSurface)
        .filter(Boolean)
        .join(" ");
      if (targetSurface.length === 0) continue;
      const rev = reverseTranslate(lang, targetSurface);
      expect(rev.english.length).toBeGreaterThan(0);
    }
  });

  it("returns deterministic output for the same target string", () => {
    const target = "h₃reːgʲs wl̩kʷom weidti";
    const a = reverseTranslate(lang, target);
    const b = reverseTranslate(lang, target);
    expect(a.english).toEqual(b.english);
    expect(a.tokens.map((t) => t.lemma)).toEqual(b.tokens.map((t) => t.lemma));
  });
});
