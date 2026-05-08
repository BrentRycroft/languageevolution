import { describe, it, expect } from "vitest";
import {
  proposeSandhiRuleEmergence,
  decaySandhiRule,
} from "../phonology/sandhi";
import type { Language, Phoneme } from "../types";
import { makeRng } from "../rng";

function tonalLang(initialRules: Array<"meeussen" | "dissimilate" | "spread" | "downstep"> = []): Language {
  return {
    phonemeInventory: {
      segmental: ["a", "i", "u"] as Phoneme[],
      usesTones: true,
    },
    toneSandhiRules: initialRules,
  } as unknown as Language;
}

describe("Phase 67 T2 — tone sandhi rule emergence/decay", () => {
  it("proposeSandhiRuleEmergence adds a new family when slots are open", () => {
    const lang = tonalLang(["dissimilate"]);
    const rng = makeRng("sandhi-emerge");
    let emerged = null;
    for (let i = 0; i < 1000 && !emerged; i++) {
      emerged = proposeSandhiRuleEmergence(lang, rng);
    }
    expect(emerged).toBeTruthy();
    expect(lang.toneSandhiRules).toContain(emerged!);
  });

  it("proposeSandhiRuleEmergence returns null when all 4 families are already present", () => {
    const lang = tonalLang(["meeussen", "dissimilate", "spread", "downstep"]);
    const rng = makeRng("sandhi-full");
    for (let i = 0; i < 100; i++) {
      expect(proposeSandhiRuleEmergence(lang, rng)).toBeNull();
    }
  });

  it("decaySandhiRule removes a family when more than 1 is present", () => {
    const lang = tonalLang(["meeussen", "dissimilate", "downstep"]);
    const rng = makeRng("sandhi-decay");
    let lost = null;
    for (let i = 0; i < 1000 && !lost; i++) {
      lost = decaySandhiRule(lang, rng);
    }
    expect(lost).toBeTruthy();
    expect(lang.toneSandhiRules!.length).toBe(2);
  });

  it("decaySandhiRule never drops below 1 rule", () => {
    const lang = tonalLang(["meeussen"]);
    const rng = makeRng("sandhi-floor");
    for (let i = 0; i < 1000; i++) {
      expect(decaySandhiRule(lang, rng)).toBeNull();
    }
    expect(lang.toneSandhiRules!.length).toBe(1);
  });

  it("non-tonal language never emerges or decays sandhi rules", () => {
    const nonTonal = {
      phonemeInventory: { segmental: ["a"] as Phoneme[], usesTones: false },
      toneSandhiRules: ["meeussen", "dissimilate"] as Array<
        "meeussen" | "dissimilate" | "spread" | "downstep"
      >,
    } as unknown as Language;
    const rng = makeRng("sandhi-nontonal");
    for (let i = 0; i < 1000; i++) {
      expect(proposeSandhiRuleEmergence(nonTonal, rng)).toBeNull();
      expect(decaySandhiRule(nonTonal, rng)).toBeNull();
    }
  });
});
