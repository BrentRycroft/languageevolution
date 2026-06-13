# Preset Authentic Vocabulary — Design

**Date:** 2026-06-13
**Branch:** `auto/storage-pointnative` (local commits only)
**Status:** Approved (brainstorming complete)

## Problem

When the app loads any built-in preset, the dictionary is dominated by **randomly
generated, made-up words**. The curated seed lexicons themselves are authentic — every
hand-authored entry in the six preset files is a real or properly-reconstructed form with
scholarly comments. The made-up words come from a separate enrichment layer:

- `presets/index.ts` wraps every catalog build in `withEnrichedLexicon(...)`.
- `withEnrichedLexicon` → `enrichToFloor` (`lexicon/enrichPreset.ts`) pads each lexicon up
  to a **1000-word floor** by calling `generateForm(meaning, phonology)`
  (`lexicon/basic240.ts`) — a deterministic hash-driven syllable generator. The forms are
  phonotactically plausible for the preset but are **invented gibberish, not real words**.

Scale of the invented padding (authored → padded to 1000):

| Preset | Authored | Coined (made-up) |
|---|---|---|
| English | ~720 | ~280 |
| PIE | ~410 | ~590 |
| Romance | ~290 | ~710 |
| Germanic | ~290 | ~710 |
| Bantu | ~270 | ~730 |
| Toki Pona | ~135 | ~865 |

The 7th catalog entry, `"default"` (`Default (Swadesh core)`), is worse: its lexicon is
built almost entirely by the same generator (`fillMissing` in `lexicon/defaults.ts` →
`DEFAULT_LEXICON`), then floor-padded.

## Goal

Make every user-facing preset contain **only authentic words**: drop the random floor, and
**significantly expand each language's authored vocabulary from authentic web sources**.

## Key decisions (from brainstorming)

1. **Drop the floor.** Stop padding presets with `generateForm` output.
2. **Expand authored vocab from authentic web sources.** Forms are web-sourced — pulled
   from online dictionaries / reconstruction databases (Wiktionary reconstruction
   categories, BLR3, the official Toki Pona list, an English IPA dictionary), not invented
   from memory. Correctness over volume: an honest gap beats a confident-but-wrong
   reconstruction.
3. **Target is open-ended but registry-bounded.** Expand "as much authentic vocabulary as
   the sources practically yield," but bounded to the engine's existing concept registry
   (`lexicon/concepts.ts`, ~1000 concepts) because a word is only *useful* (translatable,
   embeddable, anchored) if its concept is registered. Beyond-registry words would require
   growing the concept space + embeddings/anchors and are **deferred** as a separate
   follow-on. Toki Pona naturally caps at its real ~137-root inventory.
4. **Remove `"default"` from the catalog.** Drop the `"default"` descriptor from the
   user-facing `PRESETS` table. Keep `defaultConfig()` (and `DEFAULT_LEXICON` /
   `fillMissing` / `generateForm`) for tests + engine internals.
5. **Determinism re-bake of all six baselines is authorized.** Expanding the bare
   `presetX()` builders re-bakes GEN0 + GENN in `meaning_layer_baseline.test.ts`.

## Architecture & decomposition

Two halves touch disjoint things, confirmed by the baseline test using the **bare**
`presetX()` builders (not the enriched `PRESETS` table,
`meaning_layer_baseline.test.ts:38-45`):

- Dropping the floor only affects the user-facing catalog + `preset_floor.test.ts`. It does
  **not** change `meaning_layer_baseline`.
- Expanding a bare builder's `LEXICON` is what re-bakes GEN0 + GENN.

So the work decomposes into **one mechanism sub-project + one vocab sub-project per
language**.

### Sub-project M — mechanism (baseline-neutral)

- **`presets/index.ts`**: drop the `withEnrichedLexicon` import + wrapper; each entry
  becomes `build: () => presetX()`. Remove the `"default"` descriptor from `PRESETS`.
- **Delete `lexicon/enrichPreset.ts`** (`withEnrichedLexicon` / `enrichToFloor` /
  `derivePhonology`). Only `index.ts` + `preset_floor.test.ts` import it; ROADMAP references
  it in prose only (update the note).
- **Replace `preset_floor.test.ts`** with an authenticity-guard test:
  - for every catalog preset, `build().seedLexicon` deep-equals the bare
    `presetX().seedLexicon` (no synthetic layer);
  - no `"default"` id is present in `PRESETS`;
  - keep the existing `validatePresetIpa` "no blocking issues" check.
- **Keep** `generateForm` / `fillMissing` / `DEFAULT_LEXICON` — now exercised only by
  `defaultConfig()` internals + tests.
- **Runtime gaps already fill principled, not random.** After the floor is gone, a concept
  with no authored word is coined at runtime via semantically-coherent compounding
  (`composeForGap` / vector-composition), **not** `generateForm` (confirmed: `generateForm`
  has no runtime-coinage caller). Gen-0 dictionaries are smaller but honest.

`meaning_layer_baseline` stays green through M, proving M changed nothing for the six
languages' evolution.

### Sub-projects E1…E6 — vocab (one per language; each an authorized GEN0+GENN re-bake)

Per-language primary sources and normalization conventions:

| Sub-proj | Language | Primary source | Normalization notes |
|---|---|---|---|
| E1 | English | Wiktionary / CMUdict GenAm IPA | map to preset's narrow IPA, `ɹ` not `r` |
| E2 | Romance | Wiktionary Latin lemmas | → Vulgar Latin: `β` spirantization, 7-vowel, drop length |
| E3 | PIE | Wiktionary Reconstruction:Proto-Indo-European | strip laryngeals (Phase 58.6 convention) |
| E4 | Germanic | Wiktionary Reconstruction:Proto-Germanic (Kroonen) | length `ː`, `-az`/`-ą` endings |
| E5 | Bantu | BLR3 / Wiktionary Proto-Bantu | tone-mark every nucleus (tonal gate) |
| E6 | Toki Pona | official nimi pu list | ~137 roots — small top-up only; gaps stay compounds |

Each E sub-project is **iterative and batched**. Repeat per batch:

1. Pick a set of registry concepts not yet keyed in the preset.
2. Fetch each word's source IPA / reconstruction from the primary source.
3. **Tokenize** the source form into the preset's phoneme array — multi-character phonemes
   (`tʃ`, `kʷ`, `gʲʰ`, `dʒ`, NC clusters `ⁿg`, tone-marked vowels) stay single array
   elements.
4. Apply the preset's conventions (column 4 above).
5. Skip a concept that is already keyed, is a colexification *absorbed* member (reserved),
   or is a bound morpheme.
6. Append to the preset's `LEXICON`.
7. Run `validatePresetIpa`; resolve any `unknown_phoneme` / `raw_r_in_rhotic_approximant` /
   `missing_tone` / `reconstruction_phoneme_outside_mode` issues before committing.

The lexicon grows monotonically; commit per batch. Re-bake the preset's hashes once at the
end of the preset.

## Quality gate (per preset)

`validatePresetIpa(config)` (`presets/validatePreset.ts`) must return no blocking issues:

- `unknown_phoneme` — every phoneme must resolve via `featuresOf` (be in `PHONE_FEATURES`).
- `empty_form` — no empty `WordForm`.
- `raw_r_in_rhotic_approximant` — English (`rhoticApproximant: true`) uses `ɹ`, not `r`.
- `missing_tone` — Bantu (`seedToneRegime: "tonal"`) marks every vowel nucleus with a tone.
- `reconstruction_phoneme_outside_mode` — laryngeals / triple-diacritic stops only under
  `reconstructionMode: true` (PIE).
- `stale_freq` / `stale_suppletion` — no dangling references (new entries don't add these,
  but the check stays green).

## Error handling

- A sourced form needing a phoneme not in the preset's inventory: add the phoneme **only if
  the language genuinely has it**; otherwise **skip the word**. Never invent a phoneme to
  force a word in.
- A source giving multiple variant reconstructions: pick the standard/most-cited form; this
  is the same editorial judgment the existing curated entries already embody.

## Determinism & testing

- **M:** targeted run only — the new authenticity-guard test, `preset_ipa`, and a
  `meaning_layer_baseline` GEN0 spot-check proving neutrality. **No re-bake.**
- **Each E:** `validatePresetIpa` clean for that preset; then an **authorized re-bake** of
  that preset's GEN0 and (under `RUN_SLOW=1`) GENN hashes in
  `meaning_layer_baseline.test.ts`, each **captured twice** to confirm reproducibility, with
  a dated re-bake comment explaining the vocabulary expansion. Editing those hashes is
  permitted here because it is an authorized re-bake (the gate is reproducibility, not
  byte-identity-vs-old).
- **Final gate:** one full `vitest run` + `RUN_SLOW` baseline after all sub-projects merge —
  not inside every batch (per CLAUDE.md test-efficiency guidance).

## Out of scope (follow-on)

- Beyond-registry vocabulary (words whose concept is not in `concepts.ts`) — needs concept
  registry + embedding/anchor growth.
- Reworking the runtime gap-coinage / translator-coinage path (the ROADMAP's
  TRANSLATOR-COINAGE RETHINK) — independent of seed authenticity.
- De-randomizing `DEFAULT_LEXICON` itself — unnecessary once `"default"` leaves the catalog.

## Success criteria

1. Loading any catalog preset shows **only authentic authored words** — no `generateForm`
   output reaches the user.
2. The `"default"` preset is gone from the catalog; six real languages remain.
3. Each preset's authored vocabulary is **significantly expanded** from authentic web
   sources, bounded to registry concepts the language has a real word for.
4. `validatePresetIpa` is clean for every preset.
5. All six baselines re-baked deliberately; reproducibility preserved (same config →
   identical output, captured twice); full suite green at the final gate.
