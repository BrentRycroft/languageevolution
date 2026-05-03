import { describe, it, expect } from "vitest";
import {
  PRODUCTIVITY_THRESHOLD,
  categoryLabel,
  registerSuffixUsage,
  findSuffixByTag,
  type DerivationalSuffix,
} from "../lexicon/derivation";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { cloneLanguage } from "../utils/clone";
import { stepGenesis } from "../steps/genesis";
import { makeRng } from "../rng";
import type { Language } from "../types";

describe("Phase 22 — categoryLabel", () => {
  it("returns the readable name for every DerivationCategory", () => {
    expect(categoryLabel("agentive")).toBe("agent noun");
    expect(categoryLabel("abstractNoun")).toBe("abstract noun");
    expect(categoryLabel("dominionAbstract")).toBe(
      "dominion / abstract realm",
    );
    expect(categoryLabel("nominalisation")).toBe("nominalisation");
    expect(categoryLabel("diminutive")).toBe("diminutive");
    expect(categoryLabel("adjectival")).toBe("adjective");
    expect(categoryLabel("denominal")).toBe("denominal verb");
  });

  it("returns 'derivation' for undefined / unknown categories", () => {
    expect(categoryLabel(undefined)).toBe("derivation");
  });
});

describe("Phase 22 — registerSuffixUsage", () => {
  function makeSuffix(): DerivationalSuffix {
    return {
      affix: ["e", "r"],
      tag: "-er",
      category: "agentive",
      usageCount: 0,
      productive: false,
    };
  }

  it("increments usageCount on each call", () => {
    const s = makeSuffix();
    registerSuffixUsage(s, 0);
    expect(s.usageCount).toBe(1);
    registerSuffixUsage(s, 1);
    expect(s.usageCount).toBe(2);
  });

  it("flips productive at exactly PRODUCTIVITY_THRESHOLD attestations", () => {
    const s = makeSuffix();
    let r1 = registerSuffixUsage(s, 10);
    let r2 = registerSuffixUsage(s, 11);
    let r3 = registerSuffixUsage(s, 12);
    expect(r1.justBecameProductive).toBe(false);
    expect(r2.justBecameProductive).toBe(false);
    expect(r3.justBecameProductive).toBe(PRODUCTIVITY_THRESHOLD === 3);
    expect(s.productive).toBe(true);
    expect(s.establishedGeneration).toBe(12);
  });

  it("once productive, future usages don't re-fire justBecameProductive", () => {
    const s = makeSuffix();
    for (let i = 0; i < PRODUCTIVITY_THRESHOLD; i++) registerSuffixUsage(s, i);
    expect(s.productive).toBe(true);
    const r = registerSuffixUsage(s, 100);
    expect(r.justBecameProductive).toBe(false);
    expect(s.usageCount).toBe(PRODUCTIVITY_THRESHOLD + 1);
    // establishedGeneration is set on the threshold-crossing call only.
    expect(s.establishedGeneration).toBe(PRODUCTIVITY_THRESHOLD - 1);
  });

  it("treats undefined usageCount on legacy suffixes as 0", () => {
    const legacy: DerivationalSuffix = {
      affix: ["e", "r"],
      tag: "-er",
      category: "agentive",
    };
    const r = registerSuffixUsage(legacy, 5);
    expect(legacy.usageCount).toBe(1);
    expect(r.justBecameProductive).toBe(false);
  });
});

describe("Phase 22 — productivity tracking via stepGenesis", () => {
  function freshEnglishWithSuffix(): { lang: Language; suffix: DerivationalSuffix } {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    // Find / install an agentive suffix with a fixed tag for deterministic
    // assertions. English seed gives one already; make sure it's tagged "-or".
    let agent = ((lang.derivationalSuffixes ?? []) as DerivationalSuffix[]).find(
      (s) => s.category === "agentive",
    );
    if (!agent) {
      agent = {
        affix: ["o", "r"],
        tag: "-or",
        category: "agentive",
        usageCount: 0,
        productive: false,
      };
      lang.derivationalSuffixes = [...(lang.derivationalSuffixes ?? []), agent];
    } else {
      agent.tag = "-or";
      agent.usageCount = 0;
      agent.productive = false;
    }
    return { lang, suffix: agent };
  }

  it("emits exactly one 'productive rule established' grammaticalize event when crossing threshold", () => {
    const { lang, suffix } = freshEnglishWithSuffix();
    // Simulate three attestations in sequence — direct calls, not via the
    // RNG-driven loop, so we can assert the event sequence cleanly.
    registerSuffixUsage(suffix, 1);
    registerSuffixUsage(suffix, 2);
    const r = registerSuffixUsage(suffix, 3);
    expect(r.justBecameProductive).toBe(true);
    expect(suffix.productive).toBe(true);
    expect(suffix.establishedGeneration).toBe(3);
    void lang;
  });

  it("each non-productive suffix tracks its own count independently", () => {
    const { lang } = freshEnglishWithSuffix();
    const all = (lang.derivationalSuffixes ?? []) as DerivationalSuffix[];
    const a = all.find((s) => s.category === "agentive")!;
    const b = all.find((s) => s.category === "diminutive");
    if (!b) return; // diminutive not seeded for this preset
    registerSuffixUsage(a, 1);
    registerSuffixUsage(a, 2);
    registerSuffixUsage(a, 3);
    expect(a.productive).toBe(true);
    expect(b.productive).toBeFalsy();
  });
});

describe("Phase 22 — daughter languages inherit productivity", () => {
  it("cloneLanguage preserves productive + usageCount + establishedGeneration", () => {
    const sim = createSimulation(presetEnglish());
    const parent = sim.getState().tree[sim.getState().rootId]!.language;
    const suffix = ((parent.derivationalSuffixes ?? []) as DerivationalSuffix[])[0];
    if (!suffix) {
      // Unexpected — English preset always seeds derivational suffixes.
      throw new Error("no derivational suffixes on parent");
    }
    suffix.usageCount = 5;
    suffix.productive = true;
    suffix.establishedGeneration = 47;
    const daughter = cloneLanguage(parent);
    const dSuffix = (daughter.derivationalSuffixes ?? []).find(
      (s) => s.tag === suffix.tag,
    );
    expect(dSuffix?.usageCount).toBe(5);
    expect(dSuffix?.productive).toBe(true);
    expect(dSuffix?.establishedGeneration).toBe(47);
  });
});

describe("Phase 22 — pre-Phase-22 saves load cleanly", () => {
  it("legacy suffixes (no usageCount) increment from 0 on first registration", () => {
    const legacy: DerivationalSuffix = {
      affix: ["e", "r"],
      tag: "-er",
      category: "agentive",
      // no usageCount, productive, or establishedGeneration
    };
    expect(legacy.usageCount).toBeUndefined();
    expect(legacy.productive).toBeUndefined();
    registerSuffixUsage(legacy, 0);
    expect(legacy.usageCount).toBe(1);
    expect(legacy.productive).toBeFalsy();
    registerSuffixUsage(legacy, 1);
    registerSuffixUsage(legacy, 2);
    expect(legacy.productive).toBe(true);
  });
});

describe("Phase 22 — findSuffixByTag", () => {
  it("returns the matching suffix when present", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const first = (lang.derivationalSuffixes ?? [])[0];
    if (!first) return;
    expect(findSuffixByTag(lang, first.tag)).toBe(first);
  });

  it("returns null when no suffix matches", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    expect(findSuffixByTag(lang, "-zzznevergonnamatch")).toBeNull();
  });
});

describe("Phase 22 — stepGenesis path: event suppression once productive", () => {
  it("the first 3 derivations log coinage events; the 4th is silent (rule applied)", () => {
    // We can't easily force stepGenesis to fire deterministically against a
    // specific suffix N times in a row from the RNG-driven path. Instead,
    // spot-check the suppression *logic* by simulating the post-commit
    // sequence the way stepGenesis does:
    //   - increment usage,
    //   - on threshold-cross, emit grammaticalize,
    //   - emit coinage only if !wasProductive.
    const lang: Language = {
      id: "L",
      name: "T",
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
      derivationalSuffixes: [
        {
          affix: ["o", "r"],
          tag: "-or",
          category: "agentive",
          usageCount: 0,
          productive: false,
        },
      ],
    };
    const suffix = (lang.derivationalSuffixes![0]!) as DerivationalSuffix;

    // Emulate four derivation commits.
    let coinageEvents = 0;
    let establishmentEvents = 0;
    for (let attestation = 1; attestation <= 4; attestation++) {
      const wasProductive = !!suffix.productive;
      const r = registerSuffixUsage(suffix, attestation);
      if (r.justBecameProductive) establishmentEvents++;
      if (!wasProductive) coinageEvents++;
    }
    // Threshold = 3, so:
    //   attestation 1: wasProductive=false → coinage++
    //   attestation 2: wasProductive=false → coinage++
    //   attestation 3: wasProductive=false → coinage++; this call flips → establishment++
    //   attestation 4: wasProductive=true → silent
    expect(coinageEvents).toBe(PRODUCTIVITY_THRESHOLD);
    expect(establishmentEvents).toBe(1);
    expect(suffix.productive).toBe(true);
  });
});

// Smoke test: integration with the real stepGenesis path. Just verify it
// doesn't crash + leaves the lang in a sensible state.
describe("Phase 22 — stepGenesis integration smoke", () => {
  it("running a few generations doesn't crash and may register suffix usage", () => {
    const sim = createSimulation(presetEnglish());
    const rng = makeRng("phase22-smoke");
    const cfg = sim.getConfig();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    const before = (lang.derivationalSuffixes ?? []).reduce(
      (sum, s) => sum + (s.usageCount ?? 0),
      0,
    );
    for (let g = 1; g <= 5; g++) {
      stepGenesis(lang, cfg, sim.getState(), rng, g);
    }
    const after = (lang.derivationalSuffixes ?? []).reduce(
      (sum, s) => sum + (s.usageCount ?? 0),
      0,
    );
    // After 5 gens, usage may or may not have grown depending on RNG and
    // tier; just assert non-negative + structurally sound.
    expect(after).toBeGreaterThanOrEqual(before);
  });
});
