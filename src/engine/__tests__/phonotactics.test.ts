import { describe, it, expect } from "vitest";
import {
  phonotacticScore,
  langPhonotacticScore,
  onsetClusterLen,
  codaClusterLen,
  maxMedialCluster,
  profileBadge,
  PERMISSIVE_PROFILE,
  type PhonotacticProfile,
} from "../phonology/phonotactics";
import { presetEnglish } from "../presets/english";
import { presetTokipona } from "../presets/tokipona";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { createSimulation } from "../simulation";
import type { Language } from "../types";

const STRICT_CV: PhonotacticProfile = {
  maxOnset: 1,
  maxCoda: 0,
  maxCluster: 1,
  strictness: 0.95,
};

const ENGLISH_LIKE: PhonotacticProfile = {
  maxOnset: 3,
  maxCoda: 4,
  maxCluster: 4,
  strictness: 0.4,
};

function freshLang(preset: ReturnType<typeof presetEnglish>): Language {
  const sim = createSimulation(preset);
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 27a — phonotactic primitives", () => {
  it("onsetClusterLen counts consonants at the start of the word", () => {
    expect(onsetClusterLen(["b", "a"])).toBe(1);
    expect(onsetClusterLen(["s", "p", "r", "a", "y"])).toBe(3);
    expect(onsetClusterLen(["a", "b"])).toBe(0); // vowel-initial
  });

  it("codaClusterLen counts consonants at the end of the word", () => {
    expect(codaClusterLen(["b", "a", "t"])).toBe(1);
    expect(codaClusterLen(["m", "ɪ", "n", "d"])).toBe(2);
    expect(codaClusterLen(["s", "t", "r", "ɛ", "n", "θ", "s"])).toBe(3);
    expect(codaClusterLen(["b", "a"])).toBe(0); // vowel-final
  });

  it("maxMedialCluster finds the largest internal CC run", () => {
    expect(maxMedialCluster(["a", "k", "t", "a"])).toBe(2);
    expect(maxMedialCluster(["a", "p", "s", "t", "r", "a"])).toBe(4);
    expect(maxMedialCluster(["a", "b", "a"])).toBe(1);
    expect(maxMedialCluster(["a", "k", "t"])).toBe(0); // CC# is coda, not medial
  });
});

describe("Phase 27a — phonotacticScore", () => {
  it("returns 1.0 for a fully compliant CVC form", () => {
    expect(phonotacticScore(["b", "a", "t"], ENGLISH_LIKE)).toBe(1);
  });

  it("returns 1.0 for any form when strictness is 0", () => {
    const lax = { ...STRICT_CV, strictness: 0 };
    expect(phonotacticScore(["s", "t", "r", "ɛ", "n", "θ", "s"], lax)).toBe(1);
  });

  it("strict CV profile penalises a CCV form", () => {
    const score = phonotacticScore(["s", "p", "a"], STRICT_CV);
    expect(score).toBeLessThan(1);
    expect(score).toBeGreaterThan(0);
  });

  it("strict CV profile heavily penalises CCCVCC", () => {
    const score = phonotacticScore(["s", "t", "r", "a", "n", "d"], STRICT_CV);
    expect(score).toBeLessThan(0.3);
  });

  it("English-like profile tolerates CCCVC", () => {
    expect(
      phonotacticScore(["s", "p", "r", "a", "y"], ENGLISH_LIKE),
    ).toBeGreaterThan(0.7);
  });

  it("scores 1.0 for empty form (degenerate input)", () => {
    expect(phonotacticScore([], STRICT_CV)).toBe(1);
  });
});

describe("Phase 27a — per-preset profiles seeded correctly", () => {
  it("English preset has permissive profile (CCCVCCCC)", () => {
    const lang = freshLang(presetEnglish());
    expect(lang.phonotacticProfile).toBeDefined();
    expect(lang.phonotacticProfile!.maxOnset).toBe(3);
    expect(lang.phonotacticProfile!.maxCoda).toBe(4);
    expect(lang.phonotacticProfile!.strictness).toBe(0.4);
  });

  it("Romance preset has medium-strict profile (CCVCC)", () => {
    const lang = freshLang(presetRomance());
    expect(lang.phonotacticProfile!.maxOnset).toBe(2);
    expect(lang.phonotacticProfile!.maxCoda).toBe(2);
    expect(lang.phonotacticProfile!.strictness).toBeCloseTo(0.7);
  });

  it("Bantu preset has CV-with-NC profile, no codas", () => {
    const lang = freshLang(presetBantu());
    expect(lang.phonotacticProfile!.maxOnset).toBe(2);
    expect(lang.phonotacticProfile!.maxCoda).toBe(0);
    expect(lang.phonotacticProfile!.strictness).toBeCloseTo(0.85);
  });

  it("Toki Pona preset has strict CV profile", () => {
    const lang = freshLang(presetTokipona());
    expect(lang.phonotacticProfile!.maxOnset).toBe(1);
    expect(lang.phonotacticProfile!.maxCoda).toBe(0);
    expect(lang.phonotacticProfile!.strictness).toBeGreaterThan(0.9);
  });
});

describe("Phase 27a — langPhonotacticScore", () => {
  it("scores English /strɛŋθs/ tolerably for English (≥ 0.5)", () => {
    const lang = freshLang(presetEnglish());
    const score = langPhonotacticScore(lang, ["s", "t", "r", "ɛ", "ŋ", "θ", "s"]);
    expect(score).toBeGreaterThan(0.5);
  });

  it("scores English /strɛŋθs/ poorly for Toki Pona (< 0.3)", () => {
    const lang = freshLang(presetTokipona());
    const score = langPhonotacticScore(lang, ["s", "t", "r", "ɛ", "ŋ", "θ", "s"]);
    expect(score).toBeLessThan(0.3);
  });

  it("falls back to PERMISSIVE_PROFILE when language has no profile set", () => {
    const lang = freshLang(presetEnglish());
    delete lang.phonotacticProfile;
    // With permissive defaults, even nasty clusters score reasonably.
    const score = langPhonotacticScore(lang, ["s", "p", "r", "a", "y"]);
    expect(score).toBe(1);
  });
});

describe("Phase 27a — profileBadge", () => {
  it("renders strict CV as 'CV'", () => {
    expect(profileBadge(STRICT_CV)).toBe("CV");
  });

  it("renders English-like as CCCVCCCC", () => {
    expect(profileBadge(ENGLISH_LIKE)).toBe("CCCVCCCC");
  });

  it("renders permissive default", () => {
    expect(profileBadge(PERMISSIVE_PROFILE)).toBe("CCCVCCCC");
  });
});
