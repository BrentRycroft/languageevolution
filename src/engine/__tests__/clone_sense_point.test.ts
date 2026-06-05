import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { syncWordsFromLexicon } from "../lexicon/word";
import { cloneLanguage } from "../utils/clone";

function freshEnglishWithWords() {
  const sim = createSimulation(presetEnglish());
  const lang = sim.getState().tree[sim.getState().rootId]!.language;
  if (!lang.words) syncWordsFromLexicon(lang, 0);
  return lang;
}

describe("cloneLanguage — sense point independence", () => {
  it("a cloned sense's point array is NOT shared with the parent", () => {
    const lang = freshEnglishWithWords();
    expect(lang.words && lang.words.length > 0).toBe(true);
    const sense = lang.words![0]!.senses[0]!;
    sense.point = [1, 2, 3];
    const clone = cloneLanguage(lang);
    clone.words![0]!.senses[0]!.point![0] = 999;
    expect(sense.point[0]).toBe(1);
  });
  it("a sense with no point clones fine (point stays undefined)", () => {
    const lang = freshEnglishWithWords();
    const sense = lang.words![0]!.senses[0]!;
    delete sense.point;
    const clone = cloneLanguage(lang);
    expect(clone.words![0]!.senses[0]!.point).toBeUndefined();
  });
});
