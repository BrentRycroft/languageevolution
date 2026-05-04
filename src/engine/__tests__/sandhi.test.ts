import { describe, it, expect } from "vitest";
import { stepToneSandhi } from "../phonology/sandhi";
import { HIGH, LOW, MID, RISING, FALLING, toneOf } from "../phonology/tone";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import { makeRng } from "../rng";
import type { Language } from "../types";

function freshTonalLang(): Language {
  const sim = createSimulation(presetEnglish());
  const lang = sim.getState().tree[sim.getState().rootId]!.language;
  // Force-enable tone tracking + seed a tonal lexicon.
  lang.phonemeInventory.usesTones = true;
  lang.phonemeInventory.tones = [HIGH, MID, LOW, RISING, FALLING];
  return lang;
}

describe("Phase 29 Tranche 5g — tone sandhi", () => {
  it("noop when language doesn't use tones", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree[sim.getState().rootId]!.language;
    lang.phonemeInventory.usesTones = false;
    const rng = makeRng("sandhi-noop");
    expect(stepToneSandhi(lang, rng, 1)).toBe(0);
  });

  it("low + low → rising + low (Mandarin T3 sandhi)", () => {
    const lang = freshTonalLang();
    lang.lexicon["__test__"] = ["n", "i" + LOW, "h", "a" + LOW];
    // Run several gens to overcome the 0.35 per-site probability.
    let resolved = false;
    for (let g = 0; g < 30; g++) {
      const rng = makeRng(`sandhi-low-low-${g}`);
      stepToneSandhi(lang, rng, g);
      const form = lang.lexicon["__test__"]!;
      const tA = toneOf(form[1]!);
      const tB = toneOf(form[3]!);
      if (tA === RISING && tB === LOW) {
        resolved = true;
        break;
      }
    }
    expect(resolved).toBe(true);
  });

  it("OCP: high + high → high + mid", () => {
    const lang = freshTonalLang();
    lang.lexicon["__test__"] = ["t", "a" + HIGH, "n", "a" + HIGH];
    let resolved = false;
    for (let g = 0; g < 40; g++) {
      const rng = makeRng(`sandhi-high-high-${g}`);
      stepToneSandhi(lang, rng, g);
      const form = lang.lexicon["__test__"]!;
      if (toneOf(form[1]!) === HIGH && toneOf(form[3]!) === MID) {
        resolved = true;
        break;
      }
    }
    expect(resolved).toBe(true);
  });

  it("doesn't touch non-adjacent (in tone-bearing terms) tones across long stretches", () => {
    const lang = freshTonalLang();
    // Two LOW tones with NO tone-bearing segments in between (just consonants):
    // they ARE adjacent in the tone tier even though phonemes are not.
    // The rule should still fire.
    lang.lexicon["__test__"] = ["m", "a" + LOW, "p", "t", "a" + LOW];
    let resolved = false;
    for (let g = 0; g < 30; g++) {
      const rng = makeRng(`sandhi-spaced-${g}`);
      stepToneSandhi(lang, rng, g);
      const form = lang.lexicon["__test__"]!;
      if (toneOf(form[1]!) === RISING && toneOf(form[4]!) === LOW) {
        resolved = true;
        break;
      }
    }
    expect(resolved).toBe(true);
  });
});
