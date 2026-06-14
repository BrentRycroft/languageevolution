import { describe, expect, test } from "vitest";
import { presetEnglish } from "../../presets/english";
import { buildInitialState } from "../../steps/init";
import { addSynonym, setLexiconForm } from "../mutate";
import { formKeyOf } from "../word";
import { pickRegisterWeightedSynonym } from "../synonymSelect";

/**
 * registerSynonymPick.test.ts — G4 Task 3 LOCK.
 *
 * A meaning with a common (unmarked) form and a rare (marked) synonym must
 * realise the COMMON one under neutral register and the MARKED one only under
 * a marked (literary / "high") register. Selection is deterministic.
 */

function freshLang() {
  const cfg = { ...presetEnglish(), seed: "register-pick-test" };
  const state = buildInitialState(cfg);
  return state.tree[state.rootId]!.language;
}

const COMMON = ["b", "l", "a", "k"];
const RARE = ["s", "w", "a", "r", "θ", "i"];

function setup() {
  const lang = freshLang();
  setLexiconForm(lang, "black", COMMON.slice(), { bornGeneration: 0, weight: 0.9 });
  addSynonym(lang, "black", RARE.slice(), { bornGeneration: 0, register: "high", weight: 0.1 });
  return lang;
}

describe("G4 — register + commonness-weighted synonym pick (LOCK)", () => {
  test("neutral register picks the common/unmarked form", () => {
    const lang = setup();
    const picked = pickRegisterWeightedSynonym(lang, "black", { register: "neutral" });
    expect(picked && formKeyOf(picked)).toBe(formKeyOf(COMMON));
  });

  test("no register (default) picks the common/unmarked form", () => {
    const lang = setup();
    const picked = pickRegisterWeightedSynonym(lang, "black", {});
    expect(picked && formKeyOf(picked)).toBe(formKeyOf(COMMON));
  });

  test("marked (high/literary) register allows the rare/marked synonym", () => {
    const lang = setup();
    const picked = pickRegisterWeightedSynonym(lang, "black", { register: "high" });
    expect(picked && formKeyOf(picked)).toBe(formKeyOf(RARE));
  });

  test("is deterministic", () => {
    const lang = setup();
    const a = pickRegisterWeightedSynonym(lang, "black", { register: "high" });
    const b = pickRegisterWeightedSynonym(lang, "black", { register: "high" });
    expect(a && formKeyOf(a)).toBe(b && formKeyOf(b));
  });

  test("rotation tracker avoids repeating the just-used common form", () => {
    const lang = setup();
    const recent = new Set<string>([formKeyOf(COMMON)]);
    const picked = pickRegisterWeightedSynonym(lang, "black", {
      register: "neutral",
      recentlyUsed: recent,
    });
    // With the common form already used this sentence, prefer the next candidate.
    expect(picked && formKeyOf(picked)).not.toBe(formKeyOf(COMMON));
  });
});
