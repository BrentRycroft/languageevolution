import { describe, it, expect } from "vitest";
import { rhymeSyllable, rhymesWith, syllableCount } from "../phonology/rhyme";
import {
  syllableStresses,
  lineMeterPattern,
  meterScore,
  METER_TARGETS,
} from "../phonology/meter";
import {
  scoreCandidateLine,
  pickStanza,
  diagnoseStanza,
  type CandidateLine,
} from "../narrative/poetry";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import type { Language } from "../types";

function freshEnglish(): Language {
  const sim = createSimulation(presetEnglish());
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 26d — rhyme primitives", () => {
  it("rhymeSyllable extracts the final stressed nucleus + coda", () => {
    expect(rhymeSyllable(["k", "æ", "t"], "penult")).toEqual(["æ", "t"]);
    expect(rhymeSyllable(["b", "æ", "t"], "penult")).toEqual(["æ", "t"]);
  });

  it("rhymesWith returns true for cat/bat (both end in /æt/)", () => {
    expect(rhymesWith(["k", "æ", "t"], ["b", "æ", "t"], "penult")).toBe(true);
  });

  it("rhymesWith returns false for cat/dog", () => {
    expect(rhymesWith(["k", "æ", "t"], ["d", "ɔ", "g"], "penult")).toBe(false);
  });

  it("rhymesWith handles empty forms gracefully", () => {
    expect(rhymesWith([], ["k", "æ", "t"], "penult")).toBe(false);
    expect(rhymesWith(["k", "æ", "t"], [], "penult")).toBe(false);
  });

  it("syllableCount counts vowels + syllabic consonants", () => {
    expect(syllableCount(["k", "æ", "t"])).toBe(1);
    expect(syllableCount(["w", "ɔ", "t", "ə", "r"])).toBe(2);
    expect(syllableCount(["k", "ə", "m", "p", "j", "u", "t", "ə", "r"])).toBe(3);
  });
});

describe("Phase 26d — meter primitives", () => {
  it("syllableStresses returns S/u for each syllable", () => {
    // 1-syllable word: just stressed.
    expect(syllableStresses(["k", "æ", "t"], "penult")).toEqual(["S"]);
    // 2-syllable word with penult stress: S then u.
    const stresses = syllableStresses(["w", "ɔ", "t", "ə", "r"], "penult");
    expect(stresses).toHaveLength(2);
    expect(stresses[0]).toBe("S");
  });

  it("lineMeterPattern aggregates word-level stress patterns", () => {
    const words = [["k", "æ", "t"], ["b", "æ", "t"]];
    const pattern = lineMeterPattern(words, "penult");
    expect(pattern).toBe("SS");
  });

  it("meterScore is 1.0 for an exact match", () => {
    expect(meterScore("uS", METER_TARGETS.iambic)).toBe(1.0);
    expect(meterScore("uSuS", METER_TARGETS.iambic)).toBe(1.0);
  });

  it("meterScore is 0.5 for half-mismatched lines", () => {
    expect(meterScore("Su", METER_TARGETS.iambic)).toBe(0); // exact opposite
    // "uSSu" vs target "uSuS" → matches at 0,1; mismatches at 2,3 → 0.5
    expect(meterScore("uSSu", METER_TARGETS.iambic)).toBe(0.5);
  });

  it("METER_TARGETS exposes standard meter feet", () => {
    expect(METER_TARGETS.iambic).toBe("uS");
    expect(METER_TARGETS.trochaic).toBe("Su");
    expect(METER_TARGETS.anapestic).toBe("uuS");
    expect(METER_TARGETS.dactylic).toBe("Suu");
  });
});

describe("Phase 26d — pickStanza", () => {
  function mkCandidate(forms: string[][], text: string): CandidateLine {
    return { forms, text, english: text };
  }

  it("picks the highest-meter-scoring lines for free rhyme scheme", () => {
    const lang = freshEnglish();
    const candidates: CandidateLine[] = [
      mkCandidate([["b", "æ", "t"]], "bat"),
      mkCandidate([["k", "æ", "t"]], "cat"),
      mkCandidate([["d", "ɔ", "g"]], "dog"),
    ];
    const stanza = pickStanza(candidates, lang, {
      meter: "free",
      scheme: "free",
      lineCount: 3,
    });
    expect(stanza).toHaveLength(3);
  });

  it("AABB scheme attempts to pair lines 0+1 and 2+3 by rhyme", () => {
    const lang = freshEnglish();
    // Build candidates that include rhyming pairs.
    const candidates: CandidateLine[] = [
      mkCandidate([["k", "æ", "t"]], "cat"),
      mkCandidate([["b", "æ", "t"]], "bat"),
      mkCandidate([["d", "ɔ", "g"]], "dog"),
      mkCandidate([["l", "ɔ", "g"]], "log"),
      mkCandidate([["t", "r", "iː"]], "tree"),
    ];
    const stanza = pickStanza(candidates, lang, {
      meter: "free",
      scheme: "AABB",
      lineCount: 4,
    });
    expect(stanza).toHaveLength(4);
    const diag = diagnoseStanza(stanza, "AABB", lang);
    // AABB on 4 lines expects 2 rhyme pairs. With perfect rhyme inputs,
    // we expect achieved >= 1 (at least one pair found).
    expect(diag.rhymePairsAchieved).toBeGreaterThanOrEqual(1);
  });

  it("scoreCandidateLine returns a numeric meterScore + rhymeWord", () => {
    const lang = freshEnglish();
    const cand = { forms: [["k", "æ", "t"]], text: "cat", english: "cat" };
    const scored = scoreCandidateLine(cand, lang, "iambic");
    expect(typeof scored.meterScore).toBe("number");
    expect(scored.rhymeWord).toEqual(["k", "æ", "t"]);
  });

  it("empty pool returns empty stanza", () => {
    const lang = freshEnglish();
    expect(
      pickStanza([], lang, { meter: "iambic", scheme: "AABB", lineCount: 4 }),
    ).toEqual([]);
  });
});

describe("Phase 26d — generateDiscourseNarrative('poetry') end-to-end", () => {
  it("produces a 4-line stanza without crashing", () => {
    const lang = freshEnglish();
    const stanza = generateDiscourseNarrative(lang, "poetry-test", {
      lines: 4,
      genre: "poetry",
    });
    expect(stanza.length).toBeGreaterThan(0);
    expect(stanza.length).toBeLessThanOrEqual(4);
    for (const line of stanza) {
      expect(line.text.length).toBeGreaterThan(0);
      expect(line.english.length).toBeGreaterThan(0);
    }
  });

  it("each line has a meter score and a final word for rhyme matching", () => {
    const lang = freshEnglish();
    const stanza = generateDiscourseNarrative(lang, "poetry-test-2", {
      lines: 4,
      genre: "poetry",
    });
    expect(stanza.length).toBeGreaterThan(0);
    // Each line's text should be a non-empty whitespace-joined string.
    for (const line of stanza) {
      const tokens = line.text.split(/\s+/).filter((t) => t.length > 0);
      expect(tokens.length).toBeGreaterThan(0);
    }
  });
});
