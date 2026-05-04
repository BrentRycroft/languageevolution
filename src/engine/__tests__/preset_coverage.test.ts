import { describe, it, expect } from "vitest";
import { presetPIE } from "../presets/pie";
import { presetGermanic } from "../presets/germanic";
import { presetRomance } from "../presets/romance";
import { presetBantu } from "../presets/bantu";
import { presetTokipona } from "../presets/tokipona";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import {
  TRANSITIVE_VERB_POOL,
  INTRANSITIVE_VERB_POOL,
} from "../narrative/genres";

describe("preset closed-class coverage — every preset seeds the basics", () => {
  const PRONOUNS = ["i", "you", "he", "she", "it", "we", "they"] as const;
  const COORDS = ["and", "or"] as const;
  const PREPS = ["in", "on", "to", "for", "by"] as const;
  const NEGATOR = "not";

  for (const [name, preset] of [
    ["PIE", presetPIE],
    ["Germanic", presetGermanic],
    ["Romance", presetRomance],
    ["Bantu", presetBantu],
    ["Tokipona", presetTokipona],
    ["English", presetEnglish],
  ] as const) {
    describe(name, () => {
      const lex = preset().seedLexicon;
      it("seeds every personal pronoun", () => {
        for (const p of PRONOUNS) {
          expect(lex[p], `${name} missing pronoun '${p}'`).toBeDefined();
        }
      });
      it("seeds the coordinators and / or", () => {
        for (const c of COORDS) {
          expect(lex[c], `${name} missing '${c}'`).toBeDefined();
        }
      });
      it("seeds the prepositions in / on / to / for / by", () => {
        for (const p of PREPS) {
          expect(lex[p], `${name} missing '${p}'`).toBeDefined();
        }
      });
      it("seeds the negator", () => {
        expect(lex[NEGATOR], `${name} missing '${NEGATOR}'`).toBeDefined();
      });
    });
  }

  it("Germanic + Romance + English seed articles + set articlePresence=free", () => {
    for (const preset of [presetGermanic, presetRomance, presetEnglish]) {
      const cfg = preset();
      expect(cfg.seedLexicon["the"]).toBeDefined();
      expect(cfg.seedLexicon["a"]).toBeDefined();
      expect(cfg.seedGrammar?.articlePresence).toBe("free");
    }
  });

  it("English carries SVO + no case + -s plural + -ed past + -ing progressive", () => {
    const cfg = presetEnglish();
    expect(cfg.seedGrammar?.wordOrder).toBe("SVO");
    expect(cfg.seedGrammar?.hasCase).toBe(false);
    expect(cfg.seedGrammar?.pluralMarking).toBe("affix");
    expect(cfg.seedGrammar?.tenseMarking).toBe("past");
    expect(cfg.seedGrammar?.aspectMarking).toBe("progressive");
    expect(cfg.seedMorphology?.paradigms["noun.num.pl"]).toBeDefined();
    expect(cfg.seedMorphology?.paradigms["verb.tense.past"]).toBeDefined();
    expect(cfg.seedMorphology?.paradigms["verb.aspect.prog"]).toBeDefined();
  });

  it("PIE + Tokipona + Bantu set articlePresence=none", () => {
    for (const preset of [presetPIE, presetTokipona, presetBantu]) {
      expect(preset().seedGrammar?.articlePresence).toBe("none");
    }
  });
});

describe("preset grammar typology is propagated to the proto language", () => {
  it("Romance proto carries SVO + pre-noun adjectives + free articles", () => {
    // Phase 29 Tranche 5s: Romance preset models LATIN (the proto),
    // which was pre-attributive ("magna villa"). The post-attributive
    // pattern emerged in Romance daughters and now falls out from
    // grammar drift instead of being pre-seeded.
    const sim = createSimulation(presetRomance());
    sim.step();
    const proto = sim.getState().tree["L-0"]!.language;
    expect(proto.grammar.wordOrder).toBe("SVO");
    expect(proto.grammar.adjectivePosition).toBe("pre");
    expect(proto.grammar.articlePresence).toBe("free");
  });

  it("PIE proto carries SOV + case strategy + no articles", () => {
    const sim = createSimulation(presetPIE());
    sim.step();
    const proto = sim.getState().tree["L-0"]!.language;
    expect(proto.grammar.wordOrder).toBe("SOV");
    expect(proto.grammar.caseStrategy).toBe("case");
    expect(proto.grammar.articlePresence).toBe("none");
  });
});

describe("verb transitivity split prevents 'fish die horse' nonsense", () => {
  it("intransitive verbs are not in the transitive pool", () => {
    for (const v of ["die", "sleep", "fall", "go", "come", "walk"]) {
      expect(TRANSITIVE_VERB_POOL.includes(v as never)).toBe(false);
    }
  });
  it("the canonical transitive verbs are in the transitive pool", () => {
    for (const v of ["see", "eat", "drink", "give", "take", "make", "break", "hold"]) {
      expect(TRANSITIVE_VERB_POOL.includes(v as never)).toBe(true);
    }
  });
  it("intransitive verbs are in the intransitive pool", () => {
    for (const v of ["go", "come", "walk", "run", "fall", "fly", "sleep", "die"]) {
      expect(INTRANSITIVE_VERB_POOL.includes(v as never)).toBe(true);
    }
  });
});
