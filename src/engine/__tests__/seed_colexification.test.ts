import { describe, it, expect } from "vitest";
import { buildInitialState } from "../steps/init";
import { defaultConfig } from "../config";
import { lookupForm } from "../lexicon/lookup";
import { presetBantu } from "../presets/bantu";

/**
 * seed_colexification.test.ts
 *
 * `seedColexification` lets a preset declare that two concepts share one
 * lexeme in this language (winner → absorbed meanings) — so the concept
 * space is carved the way the language actually does (e.g. Bantu arm=hand)
 * rather than mirroring the English seed inventory. It's recorded on
 * `colexifiedAs` at language birth and resolved by the lookup cascade's
 * reverse-colex rung.
 */

describe("seedColexification", () => {
  it("records the declared colexifications on the proto language", () => {
    const config = {
      ...defaultConfig(),
      seed: "seed-colex",
      seedColexification: { water: ["streamlet_x"] },
    };
    const lang = buildInitialState(config).tree["L-0"]!.language;
    expect(lang.colexifiedAs).toBeDefined();
    expect(lang.colexifiedAs!["water"]).toEqual(["streamlet_x"]);
  });

  it("an absorbed meaning (not directly lexicalised) resolves to the winner's form", () => {
    const config = {
      ...defaultConfig(),
      seed: "seed-colex-2",
      seedColexification: { water: ["streamlet_x"] },
    };
    const lang = buildInitialState(config).tree["L-0"]!.language;
    const waterForm = lang.lexicon["water"]!;
    // `streamlet_x` has no lexicon entry of its own; the declared
    // colexification makes it resolve to water's form via reverse-colex.
    // allowFallbackCoinage:false ensures we're testing resolution, not coinage.
    expect(lookupForm(lang, "streamlet_x", { allowFallbackCoinage: false })).toEqual(waterForm);
  });

  it("leaves colexifiedAs unset when no colexifications are declared", () => {
    const lang = buildInitialState({ ...defaultConfig(), seed: "no-colex" }).tree["L-0"]!.language;
    expect(lang.colexifiedAs).toBeUndefined();
  });

  it("Bantu adopts the hook: arm=hand, mouth=lip, flesh=meat colexified (not duplicates)", () => {
    const lang = buildInitialState(presetBantu()).tree["L-0"]!.language;
    const pairs: Array<[winner: string, absorbed: string]> = [
      ["hand", "arm"],
      ["mouth", "lip"],
      ["meat", "flesh"],
    ];
    for (const [winner, absorbed] of pairs) {
      expect(lang.lexicon[absorbed], `${absorbed} should not be a separate Bantu lexicon entry`).toBeUndefined();
      expect(lang.colexifiedAs?.[winner], `colexifiedAs[${winner}] should contain ${absorbed}`).toContain(absorbed);
      // The absorbed meaning resolves to the winner's form via the cascade.
      expect(lookupForm(lang, absorbed, { allowFallbackCoinage: false })).toEqual(lang.lexicon[winner]);
    }
  });
});
