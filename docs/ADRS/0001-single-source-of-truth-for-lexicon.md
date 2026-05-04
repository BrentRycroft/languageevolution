# ADR 0001: Single source of truth for the lexicon

## Status

Accepted (Phase 29 Tranche 1).

## Context

Phase 21 introduced `Language.words` — a form-keyed table of words, each
carrying one or more sense entries (polysemy). It coexisted with the
older `Language.lexicon` — a meaning-keyed map of forms. Most engine
code wrote to `lang.lexicon` directly; a few new code paths wrote to
`lang.words`. The two views drifted apart silently across phases.

By the start of Phase 29 there were 30+ direct `lang.lexicon[m] = ...`
write sites and a handful of direct `lang.words.push(...)` sites. Some
sites updated one view, some updated both, some assumed a sync would
happen elsewhere. The result:

- A meaning could exist in `lang.lexicon` but have no entry in
  `lang.words` (or vice versa).
- After phonology applied a sound change, the `words` table needed an
  explicit catch-up call (`syncWordsAfterPhonology`).
- Three pre-existing translator tests were failing because the reverse
  glossing path read `lang.words` while the forward path read
  `lang.lexicon`, and the two had drifted for a few specific meanings.

## Decision

The lexicon has a single chokepoint:

- `lexicon/mutate.ts:setLexiconForm(lang, meaning, form, opts)` is the
  ONLY way to write a (meaning, form) pair.
- `lexicon/mutate.ts:deleteMeaning(lang, meaning)` is the ONLY way to
  remove a meaning.
- `lexicon/word.ts:syncWordsAfterPhonology(lang, gen)` reconciles
  `words` against `lexicon` after a wholesale-replacement (the
  `applyChangesToLexicon` returns a new lexicon object).

Direct mutation of `lang.lexicon[...]` outside these helpers is an
error. New code reviewers should reject it.

## Consequences

- Tests in `__tests__/phase_29_invariants.test.ts` enforce the
  agreement on a 30-gen run for every preset.
- The plan calls for a future ESLint rule banning the pattern
  syntactically. Until then, the chokepoint name is a good greppable
  marker.
- One known blast radius: `phonology/pruning.ts:prunePhonemes` writes
  `lang.lexicon` directly because per-meaning routing is O(N×W). The
  end-of-step `syncWordsAfterPhonology` covers it. (See
  `steps/inventoryManagement.ts` for the comment trail.)
- One known performance impact: `setLexiconForm` does the words-table
  bookkeeping per call, so high-frequency callers (genesis loop,
  recarve loop) are slightly slower than direct write. The trade-off
  buys correctness at very low cost (~5% on the affected paths).
