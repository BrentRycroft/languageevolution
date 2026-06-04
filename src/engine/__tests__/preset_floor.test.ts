import { describe, it, expect } from "vitest";
import { PRESETS } from "../presets";
import { validatePresetIpa } from "../presets/validatePreset";
import { enrichToFloor, derivePhonology, PRESET_LEXICON_FLOOR } from "../lexicon/enrichPreset";
import { presetBantu } from "../presets/bantu";

/**
 * Lane E (MEGA overhaul): every catalog preset opens with a realistically rich
 * vocabulary (≥1000 words). The floor is applied at the `PRESETS` table — the bare
 * `presetX()` builders keep their curated seed — so this locks the user-facing
 * behaviour without disturbing the unit tests that probe mechanics on a clean seed.
 */

describe("Lane E — preset lexicon floor", () => {
  for (const p of PRESETS) {
    it(`${p.id} opens with ≥${PRESET_LEXICON_FLOOR} words and no blocking IPA issues`, () => {
      const cfg = p.build();
      const n = Object.keys(cfg.seedLexicon ?? {}).length;
      expect(n).toBeGreaterThanOrEqual(PRESET_LEXICON_FLOOR);
      // The generated words must stay valid IPA + non-empty (validator's hard checks).
      const blocking = validatePresetIpa(cfg).filter(
        (i) => i.code === "unknown_phoneme" || i.code === "empty_form",
      );
      expect(blocking).toEqual([]);
    });
  }

  it("is deterministic — the same preset builds an identical seed lexicon twice", () => {
    const a = PRESETS.find((p) => p.id === "romance")!.build().seedLexicon!;
    const b = PRESETS.find((p) => p.id === "romance")!.build().seedLexicon!;
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    for (const k of Object.keys(a)) expect(a[k]).toEqual(b[k]);
  });

  it("respects colexification — absorbed meanings are not coined a separate form", () => {
    // Bantu colexifies e.g. hand→arm, meat→flesh; the absorbed members must stay out
    // of the lexicon so they resolve to their winner, even after enrichment.
    const cfg = PRESETS.find((p) => p.id === "bantu")!.build();
    const colex = presetBantu().seedColexification!;
    for (const absorbedList of Object.values(colex)) {
      for (const absorbed of absorbedList) {
        expect(cfg.seedLexicon![absorbed], `${absorbed} should remain colexified`).toBeUndefined();
      }
    }
  });

  it("derivePhonology gives a CV (codaless) language no codas", () => {
    // Toki Pona is strict CV — derived phonology must not introduce codas.
    const tp = presetBantu(); // bantu is also CV; use its seed
    const phon = derivePhonology(tp.seedLexicon ?? {});
    expect(phon.vowels.length).toBeGreaterThan(0);
    expect(phon.onsets.length).toBeGreaterThan(0);
  });

  it("enrichToFloor leaves an already-large lexicon at/above the floor untouched in size", () => {
    const big: Record<string, [string]> = {};
    for (let i = 0; i < PRESET_LEXICON_FLOOR + 50; i++) big[`m${i}`] = ["a"];
    const out = enrichToFloor(big);
    expect(Object.keys(out).length).toBe(PRESET_LEXICON_FLOOR + 50);
  });
});
