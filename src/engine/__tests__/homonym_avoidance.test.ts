import { describe, it, expect } from "vitest";
import { areMeaningsRelated, addWord, formKeyOf } from "../lexicon/word";
import { wouldCreateUnrelatedHomonym } from "../lexicon/homonyms";
import { applyChangesToWord, type ApplyOptions } from "../phonology/apply";
import type { Language, SoundChange } from "../types";
import { makeRng } from "../rng";

/**
 * Phase 48 T1-T3: homonym-avoidance tests.
 *
 * The simulator should inhibit a word-specific sound change that
 * would create a homonym with an UNRELATED word, but allow the
 * change when the resulting homonym would be with a related word
 * (paradigm member, derivation chain, compound part, semantic
 * neighbour).
 */

function makeLang(overrides: Partial<Language> = {}): Language {
  return {
    id: "L",
    name: "Test",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: {
      wordOrder: "SVO",
      affixPosition: "suffix",
      pluralMarking: "none",
      tenseMarking: "none",
      hasCase: false,
      genderCount: 0,
    },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    retiredRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    ...overrides,
  };
}

describe("Phase 48 T1 — areMeaningsRelated extended with origin-chain + compounds", () => {
  it("identifies meanings linked via wordOriginChain (parent → child)", () => {
    const lang = makeLang({
      wordOriginChain: {
        runner: { tag: "derivation", from: "run", via: "-er.agt" },
      },
    });
    expect(areMeaningsRelated(lang, "runner", "run")).toBe(true);
    expect(areMeaningsRelated(lang, "run", "runner")).toBe(true);
  });

  it("identifies meanings via 3-hop wordOriginChain", () => {
    const lang = makeLang({
      wordOriginChain: {
        teach: { tag: "primary" },
        teacher: { tag: "derivation", from: "teach", via: "-er.agt" },
        teaching: { tag: "derivation", from: "teacher", via: "-ing" },
      },
    });
    expect(areMeaningsRelated(lang, "teaching", "teach")).toBe(true);
  });

  it("identifies compound parts as related", () => {
    const lang = makeLang({
      compounds: {
        daylight: {
          parts: ["day", "light"],
          fossilized: false,
          bornGeneration: 0,
        },
      },
    });
    expect(areMeaningsRelated(lang, "daylight", "day")).toBe(true);
    expect(areMeaningsRelated(lang, "daylight", "light")).toBe(true);
    expect(areMeaningsRelated(lang, "day", "daylight")).toBe(true);
  });

  it("returns false for genuinely unrelated meanings", () => {
    const lang = makeLang({
      wordOriginChain: {
        runner: { tag: "derivation", from: "run", via: "-er.agt" },
      },
      compounds: {
        daylight: {
          parts: ["day", "light"],
          fossilized: false,
          bornGeneration: 0,
        },
      },
    });
    // computer + dog have no chain, no compound, no semantic-neighbour link.
    expect(areMeaningsRelated(lang, "computer", "dog")).toBe(false);
    expect(areMeaningsRelated(lang, "runner", "rock")).toBe(false);
  });
});

describe("Phase 48 T2 — wouldCreateUnrelatedHomonym", () => {
  it("returns false when no collision exists", () => {
    const lang = makeLang();
    addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    expect(
      wouldCreateUnrelatedHomonym(lang, "dog", ["d", "ɔ", "g"]),
    ).toBe(false);
  });

  it("returns true when candidate collides with an unrelated word", () => {
    const lang = makeLang();
    addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    // "dog" sound-change candidate collides with cat
    expect(
      wouldCreateUnrelatedHomonym(lang, "dog", ["k", "æ", "t"]),
    ).toBe(true);
  });

  it("returns false when collision is with a related word (compound part)", () => {
    const lang = makeLang({
      compounds: {
        watchdog: {
          parts: ["watch", "dog"],
          fossilized: false,
          bornGeneration: 0,
        },
      },
    });
    addWord(lang, ["d", "ɔ", "g"], "dog", { bornGeneration: 0 });
    // watchdog change collides with dog — but they're related (parts
    // membership), so allow.
    expect(
      wouldCreateUnrelatedHomonym(lang, "watchdog", ["d", "ɔ", "g"]),
    ).toBe(false);
  });

  it("returns false when collision is with a derivation-chain ancestor", () => {
    const lang = makeLang({
      wordOriginChain: {
        runner: { tag: "derivation", from: "run", via: "-er.agt" },
      },
    });
    addWord(lang, ["r", "ʌ", "n"], "run", { bornGeneration: 0 });
    // runner sound-change candidate collides with run — related via chain.
    expect(
      wouldCreateUnrelatedHomonym(lang, "runner", ["r", "ʌ", "n"]),
    ).toBe(false);
  });

  it("returns false when candidate is the meaning's own current form", () => {
    const lang = makeLang();
    addWord(lang, ["k", "æ", "t"], "cat", { bornGeneration: 0 });
    // Looking up cat itself with cat's form — same word, no homonym.
    expect(
      wouldCreateUnrelatedHomonym(lang, "cat", ["k", "æ", "t"]),
    ).toBe(false);
  });
});

describe("Phase 48 T3 — applyChangesToWord inhibits unrelated homonyms", () => {
  function alwaysFiringRule(): SoundChange {
    return {
      id: "test:bd",
      kind: "test",
      apply: (form) => form.map((p) => (p === "b" ? "d" : p)),
      probabilityFor: () => 1.0,
    } as unknown as SoundChange;
  }

  it("inhibits b → d when result would collide with unrelated word", () => {
    const lang = makeLang({
      wordsByFormKey: new Map(),
    });
    addWord(lang, ["d", "a", "b"], "dab-meaning", { bornGeneration: 0 });
    addWord(lang, ["d", "a", "d"], "dad-other", { bornGeneration: 0 });
    // Run 100 trials. With INHIBIT_PROB=0.7, ~70 trials should
    // suppress the change; ~30 should let it through.
    let suppressed = 0;
    let applied = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`trial-${trial}`);
      const opts: ApplyOptions = {
        globalRate: 1,
        weights: {},
        langForHomonym: lang,
      };
      const result = applyChangesToWord(
        ["d", "a", "b"],
        [alwaysFiringRule()],
        rng,
        opts,
        "dab-meaning",
      );
      if (formKeyOf(result) === formKeyOf(["d", "a", "b"])) {
        suppressed++;
      } else {
        applied++;
      }
    }
    // Should be inhibited a substantial fraction of the time, but
    // not 100% (probability gate, not absolute block).
    expect(suppressed).toBeGreaterThan(40);
    expect(suppressed).toBeLessThan(95);
    expect(lang.homonymInhibitions ?? 0).toBeGreaterThan(0);
  });

  it("allows the change when result collides with related word", () => {
    const lang = makeLang({
      wordsByFormKey: new Map(),
      compounds: {
        "dab-meaning": {
          parts: ["dad-other"],
          fossilized: false,
          bornGeneration: 0,
        },
      },
    });
    addWord(lang, ["d", "a", "b"], "dab-meaning", { bornGeneration: 0 });
    addWord(lang, ["d", "a", "d"], "dad-other", { bornGeneration: 0 });
    let applied = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`trial-${trial}`);
      const opts: ApplyOptions = {
        globalRate: 1,
        weights: {},
        langForHomonym: lang,
      };
      const result = applyChangesToWord(
        ["d", "a", "b"],
        [alwaysFiringRule()],
        rng,
        opts,
        "dab-meaning",
      );
      if (formKeyOf(result) !== formKeyOf(["d", "a", "b"])) applied++;
    }
    // Related-word collision: change fires nearly always (no
    // probability gate against it).
    expect(applied).toBeGreaterThan(60);
  });

  it("respects homonymAvoidance: false (back-compat replay)", () => {
    const lang = makeLang({ wordsByFormKey: new Map() });
    addWord(lang, ["d", "a", "b"], "dab-meaning", { bornGeneration: 0 });
    addWord(lang, ["d", "a", "d"], "dad-other", { bornGeneration: 0 });
    let applied = 0;
    for (let trial = 0; trial < 100; trial++) {
      const rng = makeRng(`trial-${trial}`);
      const opts: ApplyOptions = {
        globalRate: 1,
        weights: {},
        langForHomonym: lang,
        homonymAvoidance: false,
      };
      const result = applyChangesToWord(
        ["d", "a", "b"],
        [alwaysFiringRule()],
        rng,
        opts,
        "dab-meaning",
      );
      if (formKeyOf(result) !== formKeyOf(["d", "a", "b"])) applied++;
    }
    // With the flag off, the change should fire essentially every trial.
    expect(applied).toBeGreaterThan(90);
  });

  it("per-language tunable: homonymInhibition: 0 disables inhibition", () => {
    const lang = makeLang({
      wordsByFormKey: new Map(),
      homonymInhibition: 0,
    });
    addWord(lang, ["d", "a", "b"], "dab-meaning", { bornGeneration: 0 });
    addWord(lang, ["d", "a", "d"], "dad-other", { bornGeneration: 0 });
    let applied = 0;
    for (let trial = 0; trial < 50; trial++) {
      const rng = makeRng(`trial-${trial}`);
      const opts: ApplyOptions = {
        globalRate: 1,
        weights: {},
        langForHomonym: lang,
      };
      const result = applyChangesToWord(
        ["d", "a", "b"],
        [alwaysFiringRule()],
        rng,
        opts,
        "dab-meaning",
      );
      if (formKeyOf(result) !== formKeyOf(["d", "a", "b"])) applied++;
    }
    expect(applied).toBeGreaterThan(45);
  });
});
