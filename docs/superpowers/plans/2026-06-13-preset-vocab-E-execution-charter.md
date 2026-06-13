# Preset Authentic Vocabulary — E-Sub-project Execution Charter (per language)

This charter governs the per-language vocabulary-expansion sub-projects **E1–E6**. One
subagent runs it for **exactly one language** in its own git worktree. It is the shared,
precise procedure referenced by each agent's dispatch prompt.

**Reference spec:** `docs/superpowers/specs/2026-06-13-preset-authentic-vocabulary-design.md`
(read it first — it has the full rationale).

**Context:** Sub-project M already removed the random 1000-word floor; every catalog preset
now loads only its curated hand-authored seed. Your job is to **significantly expand your
language's authored seed lexicon with genuinely authentic vocabulary**, then re-bake your
preset's two determinism hashes.

---

## 0. Base-branch self-check (do this FIRST)

You may have been started on the wrong base. Ensure your worktree is based on the pushed
feature branch, which includes sub-project M:

```bash
git fetch origin
git log --oneline -1 origin/auto/storage-pointnative   # confirm it exists
git checkout -B e-<LANG> origin/auto/storage-pointnative
```

Confirm the floor is already gone (this file should NOT exist):
`src/engine/lexicon/enrichPreset.ts` — if it exists, you are on the wrong base; fix before
continuing.

---

## 1. Your language, source, and conventions

| LANG | Preset file | Primary source | Normalization conventions |
|---|---|---|---|
| `english` | `src/engine/presets/english.ts` | Wiktionary / CMUdict General-American IPA | narrow IPA; **`ɹ` not `r`**; preset's vowel symbols (ʌ ɔ æ ɛ ə ɪ ʊ iː uː …); affricates `tʃ`/`dʒ` single elements |
| `romance` | `src/engine/presets/romance.ts` | Wiktionary Latin lemmas | **Vulgar Latin**: 7-vowel `a ɛ e i ɔ o u` (NO length `ː`); intervocalic `b`→`β`; `kʷ`/`gʷ` single elements |
| `pie` | `src/engine/presets/pie.ts` | Wiktionary Reconstruction:Proto-Indo-European | **strip laryngeals** (h₁/h₂/h₃ removed, per Phase 58.6); keep `kʲ gʲ gʷ kʷ bʰ dʰ gʰ` etc. as single elements; syllabic `r̩ l̩ m̩ n̩` |
| `germanic` | `src/engine/presets/germanic.ts` | Wiktionary Reconstruction:Proto-Germanic (Kroonen) | length `ː` phonemic; nasal endings `ã`; thematic `-az`/`-ą`; `xʷ`/`kʷ` single elements |
| `bantu` | `src/engine/presets/bantu.ts` | BLR3 / Wiktionary Reconstruction:Proto-Bantu | **TONAL — every vowel nucleus must carry a tone mark** (˩ low / ˥ high), or validation fails; NC clusters `ⁿg` single elements; CV only (no codas) |
| `tokipona` | `src/engine/presets/tokipona.ts` | Official Toki Pona word list (nimi pu) | strict CV, 9 consonants + 5 vowels only; **~137 real roots is the ceiling** — add only official words still missing, then STOP. Do not invent. |

The seed lexicon is `Record<Meaning, WordForm>` where `WordForm` is `Phoneme[]` — each phoneme
is a **separate array element** (e.g. `water: ["w", "ɔ", "t", "ə", "ɹ"]`). Multi-character
phonemes (`tʃ`, `kʷ`, `gʲʰ`, `ⁿg`, tone-marked vowels) are **single** elements.

---

## 2. Which concepts to add

- Target the engine's concept registry as the universe: `src/engine/lexicon/concepts.ts`
  (`CONCEPT_IDS`) and the clusters in `src/engine/lexicon/basic240.ts`. Add your language's
  authentic word for registry concepts **not already keyed** in your preset's `LEXICON`.
- **Skip** a meaning that is: already a key; a colexification *absorbed* member (look at the
  preset's `seedColexification` — those resolve to their winner and must stay unlexicalised);
  or a bound morpheme (the `-x.tag` / `x-` entries).
- **Do not** add concepts outside the registry (those need engine/anchor support — out of
  scope).

## 3. Target volume (first pass)

- `english`, `romance`, `pie`, `germanic`, `bantu`: add a **substantial** batch — aim for at
  least **+200 authentic registry-concept words** (more if the source readily yields them).
- `tokipona`: add only the official roots still missing (likely a few dozen at most), then stop.
- **Correctness over volume.** An honest gap beats a confident-but-wrong form. If you cannot
  source a word confidently, skip it. Never invent a reconstruction or a phoneme.

## 4. Per-batch procedure (repeat until target reached)

1. Pick a set of unkeyed registry concepts.
2. Web-source each word's form from your primary source (cite nothing in code, but verify).
3. Tokenize into your preset's `Phoneme[]` using the conventions above.
4. Append to the preset's `LEXICON` object (keep the file's existing ordering/style).
5. Run the IPA gate (Section 5); fix or drop any flagged form before continuing.
6. Commit the batch (Section 7 message style) so progress is durable.

## 5. Quality gate — `validatePresetIpa`

Your preset must have **no blocking IPA issues**. Quick check:

```bash
npx vitest run --dir src preset_ipa -t "<LANG>"
```

It runs `validatePresetIpa`. Resolve every `unknown_phoneme`, `empty_form`,
`raw_r_in_rhotic_approximant` (english), `missing_tone` (bantu), and
`reconstruction_phoneme_outside_mode` (pie) before the re-bake. If a phoneme isn't in the
inventory, add it **only if your language genuinely has it**, else drop the word.
Also keep `npx tsc --noEmit` clean.

## 6. Determinism re-bake (authorized — your preset only)

Expanding the seed changes **your** preset's two locked hashes in
`src/engine/__tests__/meaning_layer_baseline.test.ts`. Re-bake them — and **only your
language's two entries** (`GEN0["<LANG>"]` and `GENN["<LANG>"]`). Do **NOT** touch any other
preset's hash, and do **NOT** add any comment to that file (the controller writes the
consolidated re-bake note at merge time).

1. GEN0:
   ```bash
   npx vitest run --dir src meaning_layer_baseline -t "<LANG>: gen-0"
   ```
   It fails with `expected <old> to be <new>`. Run it **twice** and confirm `<new>` is
   identical both runs (reproducibility). Set `GEN0["<LANG>"]` to `<new>`.
2. GENN (slow — full 30-step trajectory):
   ```bash
   RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline -t "<LANG>"
   ```
   The gen-30 test fails with the new hash. Run it **twice**; confirm identical. Set
   `GENN["<LANG>"]` to the new value.
3. Re-run both, green:
   ```bash
   RUN_SLOW=1 npx vitest run --dir src meaning_layer_baseline -t "<LANG>"
   ```

## 7. Commit + finish

- Commit on branch `e-<LANG>` with the trailer:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  ```
  Example message: `feat(presets): expand <LANG> authentic vocabulary (+N words)`.
- Final report back to the controller MUST state: how many words you added, your primary
  source, the new `GEN0["<LANG>"]` and `GENN["<LANG>"]` values (and that each was captured
  twice identically), and any concepts you deliberately skipped as unsourceable.

## Hard don'ts

- Don't edit any preset file other than your own.
- Don't edit any baseline hash other than your language's two.
- Don't add comments to `meaning_layer_baseline.test.ts`.
- Don't invent forms or phonemes. Don't relexify English into another language.
- Don't run the full suite or other languages' RUN_SLOW (wasteful) — use `-t "<LANG>"`.
