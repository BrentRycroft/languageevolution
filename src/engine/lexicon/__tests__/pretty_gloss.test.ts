import { describe, it, expect } from "vitest";
import { prettyGloss } from "../word";
import { CONCEPT_IDS } from "../concepts";

/**
 * Lane C1 (glosses): `prettyGloss` renders raw concept IDs as clean,
 * human-readable labels for the Dictionary/Lexicon UI. Concept IDs carry
 * trailing disambiguation/POS suffixes (`bear-ish`, `answer-action`,
 * `calf-animal`, `hoe-tool`, `date-fruit`, `number-abst`, `iron-age`) that
 * are engine plumbing and must never surface in the display. This test
 * freezes the cleaning behaviour and guards against the suffixes leaking
 * back into any rendered label.
 *
 * Display-only and pure: prettyGloss takes a concept ID, no language state.
 */
describe("prettyGloss", () => {
  it("strips the user-reported ugly suffixes to clean labels", () => {
    const cases: Array<[string, string]> = [
      ["bear-ish", "bear"],
      ["hoe-tool", "hoe"],
      ["date-fruit", "date"],
      ["guard-person", "guard"],
      ["lightning-weather", "lightning"],
      ["iron-age", "iron"],
      // POS / derivation tags render a parenthetical part-of-speech marker.
      ["answer-action", "answer (v.)"],
      ["answer-noun", "answer (n.)"],
      ["answer-abst", "answer (n.)"],
      ["number-abst", "number (n.)"],
      ["ferment-v", "ferment (v.)"],
    ];
    for (const [id, want] of cases) {
      expect(prettyGloss(id)).toBe(want);
    }
  });

  it("keeps genuine multi-word lexemes intact (no over-stripping)", () => {
    expect(prettyGloss("mother-in-law")).toBe("mother-in-law");
    expect(prettyGloss("brother-in-law")).toBe("brother-in-law");
    expect(prettyGloss("ice-cream")).toBe("ice-cream");
    expect(prettyGloss("prime-minister")).toBe("prime-minister");
    expect(prettyGloss("light-bulb")).toBe("light-bulb");
    expect(prettyGloss("x-ray")).toBe("x-ray");
  });

  it("passes plain single-word concepts through unchanged", () => {
    for (const id of ["dog", "water", "run", "good", "mother", "stone"]) {
      expect(prettyGloss(id)).toBe(id);
    }
  });

  it("keeps a disambiguator when two ids share a base (no collapse-to-same)", () => {
    // calf-animal (young cow) vs calf-leg (body part): both keep their
    // clarifier so the user can still tell them apart — neither collapses
    // to a bare "calf".
    expect(prettyGloss("calf-animal")).toBe("calf (animal)");
    expect(prettyGloss("calf-leg")).toBe("calf (leg)");
    expect(prettyGloss("calf-animal")).not.toBe(prettyGloss("calf-leg"));
    expect(prettyGloss("market-day")).not.toBe(prettyGloss("market-place"));
    // answer-action (v.) and answer-noun (n.) never collide either.
    expect(prettyGloss("answer-action")).not.toBe(prettyGloss("answer-noun"));
  });

  it("is deterministic", () => {
    expect(prettyGloss("date-fruit")).toBe(prettyGloss("date-fruit"));
  });

  it("never leaks raw disambiguator suffixes or trailing dashes for ANY concept id", () => {
    // The whole registry, rendered. Assert no label carries a leaked suffix
    // tag or a dangling hyphen. Parenthetical clarifiers `(leg)` / `(v.)` are
    // intentional and allowed; bare `-suffix` tails are not.
    const LEAK = /(-ish|-action|-animal|-tool|-fruit|-tree|-weather|-abst|-person)\b/;
    for (const id of CONCEPT_IDS) {
      const label = prettyGloss(id);
      expect(label.endsWith("-"), `${id} → "${label}" ends with a dash`).toBe(
        false,
      );
      expect(
        LEAK.test(label),
        `${id} → "${label}" leaks a raw disambiguator suffix`,
      ).toBe(false);
    }
  });
});
