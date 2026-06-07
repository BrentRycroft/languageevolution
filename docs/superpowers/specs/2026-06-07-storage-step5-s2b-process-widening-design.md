# Storage step 5 — sub-project S2b (process-widening) design

**Branch:** `auto/storage-pointnative` · **Date:** 2026-06-07 · **Predecessor:** S2a (satellite re-key, DONE byte-identical)

## 1. Context & goal

Step 5 retires gloss addressing in stages. **S1** unified the form store under `LexemeId` keys and made
keyless (gloss-less, point-native) words first-class for the sound-change sweep. **S2a** re-keyed the 14
per-meaning satellite maps to `LexemeId` behind the `lexicon/satellites.ts` seam and seeded *birth-time*
satellite data for keyless words (frequency 0.4, age, origin `keyless-gap`, register `low`). After S2a a
keyless word is *addressable* in every satellite map but still carries no **process-authored** data,
because the 7 evolution processes that produce that data iterate `lexKeys(lang)` — which enumerates only
seeded (gloss-bearing) records and skips keyless ones.

**S2b widens those 7 processes so keyless words participate in them.** Goal (chosen: *"both, sequenced"*):
plumb participation correctly — form-based processes first — accept the determinism re-bake that keyless
words entering RNG-coupled iteration causes, and treat visible realism (keyless words developing variants /
suppletion / etc.) as the natural consequence rather than a separate deliverable.

**Success criteria.**
1. All 7 processes can author satellite data under a keyless word's `LexemeId`, gated by per-process
   eligibility (below).
2. A run in which no keyless word *qualifies* for any widened process is **byte-identical** to pre-S2b
   (GEN0 always byte-identical).
3. Where qualifying keyless words shift a preset's GENN trajectory, the re-bake is **deliberate,
   documented, and reproducible** (same seed → identical output twice).

## 2. Scope

**In scope — all 7 lazily-owned evolution processes** (the set the step-5 decomposition named):
variants, suppletion, ablaut, grammaticalization, derivation, recarve (split/merge), colexification.

**Out of scope (later sub-projects):** threading `LexemeId` through the ~381 seam call sites (S3);
`meaningPoints` re-key + point-native `WordSense` identity (S4); intrinsic `LexemeId` RNG order — global
determinism re-bake (S5); translation via anchor index + persistence (S6). Also still gloss-addressed and
**not** touched here: the non-registry per-meaning fields flagged in S2a (`rootInventory`,
`lexicalSpelling`, `gender`, `nounClassAssignments`, `boundMorphemeOrigin`).

## 3. Architecture (Approach A — shared widened iterator + effective-gloss resolver)

One new helper, `evolvableLexemes(lang): LexemeId[]`, in `lexicon/lexemeIdentity.ts`:

```
evolvableLexemes(lang) = [ ...seeded ids in lexKeys order, ...keyless ids sorted ]
```

Keyless ids are **appended after** all seeded ids. Paired with existing resolvers:
- `glossResolverForSweep(lang): Map<LexemeId, Meaning>` — id → effective gloss (seeded = stored gloss;
  keyless = `glossOf(point)`). Already built in S1 T4.
- `posOfPoint(point): PosClass` — emergent POS for a keyless word.

A process that today does `for (const m of lexKeys(lang))` and uses `m` as **both** identity and gloss is
split: iterate `evolvableLexemes`, use the **id** for satellite writes (`satSet(lang, field, id, …)`), and
use the resolver wherever the body needed a gloss / POS / concept.

**Append-after-seeded is the determinism keystone.** Keyless candidates are filtered *before* any
`rng.int(candidates.length)` draw and only the qualifying ones are appended after the seeded candidates,
so the seeded draw sequence is untouched until a keyless word actually qualifies (see §6).

### Three entry patterns (not a uniform lexKeys swap)

1. **lexKeys-swap (5):** `ablaut`, `suppletion`, `grammaticalization`, `derivation`, `recarve` literally
   iterate `lexKeys` → swap to `evolvableLexemes` + resolver.
2. **Sweep-authored (variants):** `stepSocialContagion` already iterates `satKeys(lang,"variants")`
   (keyless-ready). The gap is whether `recordInnovation` (`steps/phonology.ts:445`, the sound-change
   actuation call) fires for keyless swept words — audit and widen that one call site.
3. **Downstream (colexification):** authored only by recarve merges + coinage polysemy
   (`recordColexification` / `recordOneSidedColexification`). It falls out once recarve and coinage write
   colex under keyless ids; the `colexifiedAs` value arrays carry the emergent gloss.

## 4. Per-process widening map

| # | Process | File / entry | Mechanism | Keyless eligibility |
|---|---------|--------------|-----------|---------------------|
| 1 | variants | `lexicon/socialContagion.ts` ← `recordInnovation` (`steps/phonology.ts:445`) | Sweep-authored: widen the call site so keyless swept words record innovations | **Immediate** (form-based) |
| 2 | suppletion | `morphology/evolve.ts:810` `maybeSuppletion` | lexKeys-swap; verb POS via `posOfPoint` | **Immediate** (form-based) |
| 3 | ablaut | `morphology/ablaut.ts:141` | lexKeys-swap; verb POS via `posOfPoint`; existing `freq ≥ 0.7` filter already gates fresh keyless | **Immediate** (form-based) |
| 4 | grammaticalization | `morphology/evolve.ts:80` `maybeGrammaticalize` | lexKeys-swap; emergent gloss for target-category logic | **Maturity-gated** |
| 5 | derivation | `morphology/derivation.ts:129` `pickRuntimeDerivedMeaning` | lexKeys-swap; emergent gloss for derived-meaning parts | **Maturity-gated** |
| 6 | recarve (split/merge) | `semantics/recarve.ts:85,166` | lexKeys-swap; emergent gloss must satisfy `isRegisteredConcept` | **Maturity-gated** |
| 7 | colexification | `semantics/colexification.ts` (downstream of #6 + coinage) | Falls out once recarve/coinage write colex under keyless ids; value arrays carry emergent gloss | **No independent gate** — gated by its authors (recarve #6 is maturity-gated; coinage follows coinage rules) |

## 5. Eligibility — per-process decision

Form-based processes (variants, suppletion, ablaut) take keyless words **immediately**, subject to the
*same* filters seeded words already face (POS, frequency, paradigm preconditions). The concept-coupled
*iterating* processes (grammaticalization, derivation, recarve) add a **maturity gate**. Colexification
has no independent iteration, so it adds no gate of its own — it is gated by whatever authors it (the
recarve merge path is maturity-gated; the coinage-polysemy path follows coinage's existing rules).

**Maturity reuses frequency — no new clock.** One shared predicate:

```
keylessMature(lang, id) = (satGet(lang, "wordFrequencyHints", id) ?? 0.4) >= KEYLESS_MATURITY_FREQ   // 0.5
```

Keyless words are born at frequency 0.4 (S2a), so a freshly-coined word is automatically excluded from the
concept-coupled processes until its frequency climbs through normal use/drift (`bumpFrequency`) —
entrenchment = frequency, the Zipfian model the engine already uses. **Seeded words bypass the predicate
entirely** (their behaviour is unchanged). Form-based processes apply no maturity gate (ablaut's existing
`freq ≥ 0.7` already keeps fresh keyless out on its own).

**Gloss-collision rule.** When a keyless word's emergent gloss equals a seeded word's gloss (or another
keyless word's), concept-coupled processes treat them as the **same concept** — the intended realism (the
keyless word was coined into that concept's gap; convergence/colexification with a later seeded occupant is
correct). Satellite **writes always go under the distinct `LexemeId`**, so no stored data is conflated.

## 6. Determinism & re-bake

- **GEN0 byte-identical** — always (no keyless coinage has happened at gen 0).
- **No-qualifying-keyless run byte-identical** — the append-filter guard: keyless candidates are filtered
  before the `rng.int(n)` draw and appended after seeded candidates, so the seeded draw stream is untouched
  until a keyless word both exists *and* passes a widened process's filters. This is the fast canary.
- **Deliberate re-bake at GENN** — presets whose 30-gen run coins a keyless word that qualifies for a
  widened process shift trajectory; expected to be a subset of the 6 presets (mirrors S1 T4 = tokipona
  only). Update `meaning_layer_baseline` GENN hashes for **only** the affected presets, each documented
  with which keyless word and which process caused it.
- **Reproducibility is the hard requirement** (standing invariant): same seed → byte-identical output
  across two runs. New RNG draws are appended after existing draws; sort before order-sensitive
  `Object.keys`.

## 7. Testing

- **Behavior-LOCK tests** (per process / group): a qualifying keyless word develops variants / suppletion /
  ablaut; a *mature* keyless word can grammaticalize / derive / recarve / colexify; a *fresh* (freq 0.4)
  keyless word is **excluded** from the 4 concept-coupled processes.
- **Determinism canary** (fast): a seeded-only / no-qualifying-keyless run stays byte-identical — proves the
  append-filter guard. Reuse `lexical_diffusion` plus a new keyless-specific canary.
- **Reproducibility:** same seed twice → identical, concept-coupled paths included.
- **Full verification once, at the merge** (per CLAUDE.md): `RUN_SLOW meaning_layer_baseline` (GEN0
  unchanged; GENN re-baked deliberately for affected presets), then the full FAST suite. Per-task worktrees
  run only their own targeted tests + the canary; the merge step is the single full-verification gate.

## 8. Constraints / invariants

- Local commits only; **never push/PR** unless asked. Commit trailer `Co-Authored-By: Claude Opus 4.8
  <noreply@anthropic.com>`.
- `meaning_layer_baseline` GENN hashes are edited **only** as a deliberate, documented re-bake for an
  affected preset — never to paper over an unexplained divergence.
- Scope vitest with `--dir src` (sibling worktrees pollute).
- Language-agnosticism: no privileging English structure; keyless eligibility/behaviour is driven by
  geometry (point/POS) + frequency, not gloss strings. English meaning keys remain fine.
- Performance: keep the FAST suite fast (heavy behind `RUN_SLOW`); any new per-generation work must not
  regress hot paths (phonology / genesis).
