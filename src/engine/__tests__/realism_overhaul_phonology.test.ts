import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { makeRng } from "../rng";
import { DEFAULT_GRAMMAR } from "../grammar/defaults";
import {
  introducesViolation,
  violatesProfile,
  type PhonotacticProfile,
} from "../phonology/phonotactics";
import { maybeTonogenesis } from "../phonology/tonogenesis";
import { toneOf, HIGH, LOW } from "../phonology/tone";
import { lexSet, lexGet } from "../lexicon/access";
import type { Language } from "../types";

/**
 * realism_overhaul_phonology.test.ts — Lane A of the realism overhaul.
 *   #4 syllable structure gates sound change
 *   #6 regular/global change is the common path (per-word is the rare one)
 *   #7 tonogenesis as an opt-in language-level regime shift
 *
 * Behaviour tests only — the byte-identity baseline is re-based once at
 * integration (the #4/#6 changes are intentional, so it is expected red).
 */

// CV-only ("Hawaiian-style") profile: no codas, no clusters, hard.
const CV: PhonotacticProfile = { maxOnset: 1, maxCoda: 0, maxCluster: 1, strictness: 1 };

describe("Lane A #4 — syllable structure gates sound change", () => {
  it("violatesProfile flags illegal codas/clusters, ignores an anything-goes profile", () => {
    expect(violatesProfile(["t", "a"], CV)).toBe(false); // CV — legal
    expect(violatesProfile(["t", "a", "k"], CV)).toBe(true); // CVC — illegal coda
    expect(violatesProfile(["s", "t", "a"], CV)).toBe(true); // CCV — illegal onset
    // strictness <= 0 ⇒ anything-goes language never violates.
    const anything: PhonotacticProfile = { ...CV, strictness: 0 };
    expect(violatesProfile(["t", "a", "k"], anything)).toBe(false);
  });

  it("introducesViolation only fires when the change NEWLY breaks the profile", () => {
    // legal → illegal: a change that adds a coda is gated.
    expect(introducesViolation(["t", "a"], ["t", "a", "k"], CV)).toBe(true);
    // legal → legal: admissible.
    expect(introducesViolation(["t", "a"], ["p", "a"], CV)).toBe(false);
    // already-illegal → still-illegal: NOT newly introduced, so admissible
    // (a rule may operate on a word that already violates the profile).
    expect(introducesViolation(["a", "k"], ["a", "k", "s"], CV)).toBe(false);
  });
});

describe("Lane A #6 — regular/global sound change is the common path", () => {
  it("exceptionless sound laws fire over a run (the promoted global path is active)", () => {
    const cfg = presetEnglish();
    cfg.seed = "overhaul-regular";
    cfg.modes = { ...cfg.modes, tree: false, death: false };
    const sim = createSimulation(cfg);
    const root = () => sim.getState().tree[sim.getState().rootId]!.language;
    // The per-language event log is a capped ring buffer, so accumulate a
    // boolean across generations rather than counting the final log.
    let regularFired = false;
    for (let i = 0; i < 120; i++) {
      sim.step();
      const ev = root().events ?? [];
      if (ev.some((e) => /exceptionlessly/.test(e.description))) regularFired = true;
    }
    expect(regularFired).toBe(true);
  });
});

/** Minimal non-tonal language carrying a robust word-final coda voicing
 *  contrast (7 voiced-obstruent codas + 7 voiceless-obstruent codas). */
function makeContrastLang(): Language {
  const lang = {
    id: "L-0",
    name: "Proto",
    lexicon: {},
    enabledChangeIds: [],
    changeWeights: {},
    birthGeneration: 0,
    grammar: { ...DEFAULT_GRAMMAR },
    events: [],
    wordFrequencyHints: {},
    phonemeInventory: { segmental: [], tones: [], usesTones: false },
    morphology: { paradigms: {} },
    localNeighbors: {},
    conservatism: 1,
    wordOrigin: {},
    activeRules: [],
    orthography: {},
    otRanking: [],
    lastChangeGeneration: {},
    toneRegime: "non-tonal" as const,
  } as unknown as Language;
  const voiced = [["a", "b"], ["e", "d"], ["o", "g"], ["i", "v"], ["u", "z"], ["a", "d"], ["e", "g"]];
  const voiceless = [["a", "p"], ["e", "t"], ["o", "k"], ["i", "f"], ["u", "s"], ["a", "t"], ["e", "k"]];
  voiced.forEach((f, n) => lexSet(lang, `vd${n}`, f));
  voiceless.forEach((f, n) => lexSet(lang, `vl${n}`, f));
  return lang;
}

describe("Lane A #7 — tonogenesis (opt-in language-level regime shift)", () => {
  it("is OFF by default (config.modes.tonogenesis)", () => {
    expect(presetEnglish().modes.tonogenesis).toBe(false);
  });

  it("transphonologises a coda voicing contrast into a pitch split", () => {
    const lang = makeContrastLang();
    const rng = makeRng("tonogenesis-seed");
    // Rare actuation (2%/gen): roll until it fires (bounded, ~certain).
    let result: ReturnType<typeof maybeTonogenesis> = null;
    for (let i = 0; i < 2000 && !result; i++) result = maybeTonogenesis(lang, rng);
    expect(result).not.toBeNull();
    // Both series split: voiced→LOW, voiceless→HIGH.
    expect(result!.lowered).toBe(7);
    expect(result!.raised).toBe(7);
    expect(result!.toned).toBe(14);
    // The vowel before a voiced coda carries LOW; before a voiceless coda, HIGH.
    expect(toneOf(lexGet(lang, "vd0")![0]!)).toBe(LOW);
    expect(toneOf(lexGet(lang, "vl0")![0]!)).toBe(HIGH);
  });

  it("does not actuate without the conditioning contrast, or on an already-tonal language", () => {
    // No obstruent codas ⇒ no contrast ⇒ never actuates (rng-independent).
    const open = makeContrastLang();
    open.lexicon = {};
    (open as { lexemeIds?: Record<string, unknown> }).lexemeIds = {};
    lexSet(open, "a", ["t", "a"]);
    lexSet(open, "b", ["p", "a"]);
    lexSet(open, "c", ["k", "o"]);
    expect(maybeTonogenesis(open, makeRng("x"))).toBeNull();
    // Already tonal ⇒ left to the maintenance machinery, not re-actuated.
    const tonal = makeContrastLang();
    (tonal as { toneRegime: string }).toneRegime = "tonal";
    expect(maybeTonogenesis(tonal, makeRng("y"))).toBeNull();
  });
});
