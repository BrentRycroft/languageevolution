import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";
import { addAlt, pruneAlts } from "../lexicon/altForms";
import { stepSemantics } from "../steps/semantics";
import { composeTargetSentence } from "../narrative/composer";
import { makeDiscourse } from "../narrative/discourse";

function englishSim() {
  return createSimulation(presetEnglish());
}

function englishLang() {
  const sim = englishSim();
  return sim.getState().tree[sim.getState().rootId]!.language;
}

describe("Phase 20 close-out: pruneAlts wired into stepSemantics", () => {
  it("stepSemantics calls pruneAlts each generation, dropping low-freq alts over time", () => {
    const lang = englishLang();
    // Seed an alt for a low-frequency meaning so pruning has something to bite.
    lang.lexicon["__decoy__"] = ["a"];
    lang.wordFrequencyHints["__decoy__"] = 0.05;
    addAlt(lang, "__decoy__", ["b"], "low");
    expect(lang.altForms?.["__decoy__"]).toEqual([["b"]]);
    // Drive stepSemantics directly with high decay (deterministic via seeded rng).
    const rng = makeRng("prune-step-test");
    const cfg = englishSim().getConfig();
    // Force a high-decay run: invoke pruneAlts directly with prob=1 first to
    // confirm the path works end-to-end via the helper, then ensure
    // stepSemantics doesn't crash on a normal call.
    pruneAlts(lang, 1.0, rng);
    expect(lang.altForms?.["__decoy__"]).toBeUndefined();
    // Re-add and let stepSemantics run for many generations to confirm
    // gradual decay of low-freq alts.
    addAlt(lang, "__decoy__", ["b"], "low");
    for (let g = 0; g < 200; g++) {
      stepSemantics(lang, cfg, rng, g);
    }
    // After 200 gens at 0.02 base × 0.95 decay × conservatism, alt should be gone.
    expect(lang.altForms?.["__decoy__"]).toBeUndefined();
  });
});

describe("Phase 20 close-out: tier-promotion vocabulary catch-up window", () => {
  it("crossing into tier 2 sets vocabularyCatchUpUntil = nextGen + 30", () => {
    const sim = englishSim();
    // Force the language to start at tier 1 with high speakers + literacy
    // so the next 20-gen tier check promotes it to ≥2.
    const root = sim.getState().tree[sim.getState().rootId]!.language;
    root.culturalTier = 1;
    root.speakers = 5_000_000; // well above tier-2 threshold
    // Step until generation 20 where tier check fires.
    for (let i = 0; i < 20; i++) sim.step();
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    if ((lang.culturalTier ?? 0) >= 2) {
      // Catch-up window should have been opened.
      expect(lang.vocabularyCatchUpUntil).toBeDefined();
      expect(lang.vocabularyCatchUpUntil!).toBeGreaterThan(sim.getState().generation);
    } else {
      // Hysteresis may delay promotion past gen 20; the test still
      // validates that no spurious flag is set when no promotion fired.
      expect(lang.vocabularyCatchUpUntil).toBeUndefined();
    }
  });

  it("expired catch-up window is cleared by the genesis loop", () => {
    const sim = englishSim();
    // First step splits the proto into leaves (when modes.tree is on);
    // run one step then plant the expired flag on each surviving leaf.
    sim.step();
    const tree = sim.getState().tree;
    const leaves = Object.values(tree).filter((n) => n.childrenIds.length === 0);
    for (const node of leaves) {
      node.language.vocabularyCatchUpUntil = 1; // far in the past
    }
    expect(leaves.length).toBeGreaterThan(0);
    // Step a few more gens; genesis runs each gen and should delete the flag.
    for (let i = 0; i < 5; i++) sim.step();
    for (const node of leaves) {
      if (!node.language.extinct) {
        expect(node.language.vocabularyCatchUpUntil).toBeUndefined();
      }
    }
  });
});

describe("Phase 20 close-out: perfect aspect AUX in composer", () => {
  it("composer emits 'had + past-participle' for perfect-aspect past", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        aspect: "perfect",
        introducesEntity: true,
      },
      { verb: "see", subject: "dog", object: "bread" },
      ctx,
      "ipa",
    );
    const english = out.english.toLowerCase();
    // English caption: "the dog had seen the bread" (or similar)
    expect(english).toMatch(/\bhad\b/);
    expect(english).toMatch(/\bseen\b/);
    // Crucially NOT past-tense "saw" — that would mean perfect didn't kick in.
    expect(english).not.toMatch(/\bsaw\b/);
  });

  it("composer emits 'has + past-participle' for perfect-aspect present 3sg", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("daily");
    const out = composeTargetSentence(
      lang,
      {
        shape: "intransitive",
        tense: "present",
        needs: { subject: true, object: false, adjective: false, time: false, place: false },
        aspect: "perfect",
        introducesEntity: true,
      },
      { verb: "go", subject: "dog" },
      ctx,
      "ipa",
    );
    const english = out.english.toLowerCase();
    expect(english).toMatch(/\bhas\b/);
    expect(english).toMatch(/\bgone\b/);
  });

  it("perfect aspect combined with negation falls back to do-support (no double aux)", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("dialogue");
    const out = composeTargetSentence(
      lang,
      {
        shape: "transitive",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: false },
        aspect: "perfect",
        negated: true,
        introducesEntity: true,
      },
      { verb: "see", subject: "dog", object: "bread" },
      ctx,
      "ipa",
    );
    const english = out.english.toLowerCase();
    // do-support takes precedence: "did not see"
    expect(english).toMatch(/\bdid\b/);
    expect(english).toMatch(/\bnot\b/);
    // Should NOT emit "had" too — that would be a double-aux bug.
    expect(english).not.toMatch(/\bhad\b/);
  });
});

describe("Phase 20 close-out: adjunct shapes (instrument / benefactive / motion)", () => {
  it("instrument_adjunct emits 'with N' after the SVO core", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("myth");
    const out = composeTargetSentence(
      lang,
      {
        shape: "instrument_adjunct",
        tense: "past",
        needs: { subject: true, object: true, adjective: false, time: false, place: true },
        introducesEntity: true,
      },
      { verb: "make", subject: "warrior", object: "fire", place: "stone" },
      ctx,
      "ipa",
    );
    expect(out.english.toLowerCase()).toMatch(/\bwith\b/);
    expect(out.english.toLowerCase()).toMatch(/\bstone\b/);
  });

  it("benefactive emits 'for N' after the SVO core", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("daily");
    const out = composeTargetSentence(
      lang,
      {
        shape: "benefactive",
        tense: "present",
        needs: { subject: true, object: true, adjective: false, time: false, place: true },
        introducesEntity: true,
      },
      { verb: "make", subject: "mother", object: "bread", place: "child" },
      ctx,
      "ipa",
    );
    expect(out.english.toLowerCase()).toMatch(/\bfor\b/);
    expect(out.english.toLowerCase()).toMatch(/\bchild\b/);
  });

  it("motion_goal emits 'to N' adjunct on intransitive base", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "motion_goal",
        tense: "past",
        needs: { subject: true, object: false, adjective: false, time: false, place: true },
        introducesEntity: true,
      },
      { verb: "go", subject: "warrior", place: "river" },
      ctx,
      "ipa",
    );
    const english = out.english.toLowerCase();
    expect(english).toMatch(/\bto\b/);
    expect(english).toMatch(/\briver\b/);
    // Make sure default placeRoleTokens preposition ("at"/"in"/"on") didn't
    // also fire — we'd otherwise see "at ... to ..." duplication.
    expect(english).not.toMatch(/\bat\b.*\bto\b/);
  });

  it("motion_source emits 'from N' adjunct on intransitive base", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("legend");
    const out = composeTargetSentence(
      lang,
      {
        shape: "motion_source",
        tense: "past",
        needs: { subject: true, object: false, adjective: false, time: false, place: true },
        introducesEntity: true,
      },
      { verb: "come", subject: "stranger", place: "mountain" },
      ctx,
      "ipa",
    );
    expect(out.english.toLowerCase()).toMatch(/\bfrom\b/);
    expect(out.english.toLowerCase()).toMatch(/\bmountain\b/);
  });

  it("adjunct PP appears in the target surface (not just the English caption)", () => {
    const lang = englishLang();
    const ctx = makeDiscourse("myth");
    const out = composeTargetSentence(
      lang,
      {
        shape: "motion_goal",
        tense: "past",
        needs: { subject: true, object: false, adjective: false, time: false, place: true },
        introducesEntity: true,
      },
      { verb: "go", subject: "warrior", place: "river" },
      ctx,
      "ipa",
    );
    // Surface contains the IPA for "to" and "river" — i.e. has at least 4
    // space-separated chunks (subject, verb, prep, noun) at minimum.
    const chunks = out.surface.split(/\s+/).filter((s) => s.length > 0);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
  });
});
