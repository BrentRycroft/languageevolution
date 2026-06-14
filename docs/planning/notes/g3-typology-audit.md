# G3 Typology Audit — realised vs display-only

**Date:** 2026-06-14 · **Sub-project:** G3 · **Method:** per-axis probe (build a
minimal language that sets the axis + seeds the paradigm/module, translate a fixed
sentence, inspect whether the feature surfaces in `targetTokens`).

Probe harness: take a preset proto (`presetPIE` mostly), set the legacy grammar
flag, recompute `activeModules` via `computeActiveModulesFromLegacy` (so the
module-presence gate in `isFeatureActive` matches the flag), seed the relevant
`morphology.paradigms[...]` entry where the feature needs morphology to surface,
then `translateSentence(lang, "<fixed input>")`.

## Findings

| Axis | Input probe | Output (target surface) | Status |
|------|-------------|--------------------------|--------|
| `voice` (passive) | "the dog is seen" | `see/wēid·to·ti` — passive `-to-` affix present | **REALISED** |
| `aspectMarking` (progressive) | "the king is seeing the dog" (prog paradigm seeded) | `see/weid·nt·ti` — prog affix present; unseeded → bare (no paradigm to surface) | **REALISED** |
| `incorporates` | "the king sees dog" | `see/kʲwon·weid·ti` — bare object root prepended onto the verb | **REALISED** |
| `evidentialMarking` (three-way) | "the king says the word" / "...sees the dog" | reportative `say/sekʷ·mi·ti`, direct `see/weid·na·ti` — evid affixes present | **REALISED** |
| `serialVerbConstructions` | "and the king runs" | `king run` — clause-leading `and` is dropped under SVC | **REALISED** (conjunction-drop only; no full V-chaining, but that is the only behaviour the axis wires and it fires) |
| `politenessRegister` (honorific) | "please the king sees the dog" | `see/weid·sa·ti` — honorific `-sa-` affix present | **REALISED** |
| `classifierSystem` | "the king sees two dogs" / verb match | numeral `CLF:creature/gʲuːgʰ` token emitted; verb `see/weid·ka·ti` class-match affix present | **REALISED** |
| `harmony` | "the king sees the dog" | phonology-layer feature; not a realiser concern (vowel harmony mutates forms in the phonology pipeline, not in token assembly) | **REALISED elsewhere** (out of realiser scope) |
| `alignment` (erg-abs) | transitive "the king sees the dog" / intransitive "the king runs" | transitive subj `king/…·ku` (erg) + obj `dog/…·ta` (abs); intransitive subj `king/…·ta` (abs) | **REALISED** |
| **polysynthesis** (`synthesisIndex ≥ 3.0`) | "the king sees dog", `synthesisIndex = 3.5`, `incorporates = true` | only **2 tokens**: `king` + `see(+incorporated dog)`. Subject stays a separate word; no pronominal subject/object agreement stacked onto the verb; the clause does **not** look polysynthetic | **DISPLAY-ONLY** |

## Conclusion

Of the ten audited axes, nine already realise in the translator (passive voice,
aspect, noun incorporation, evidentials, the SVC conjunction-drop, honorific
politeness, classifiers, alignment case) or are handled outside the realiser
(vowel harmony, a phonology-pipeline feature). They each surface the declared
feature in output when the language carries the paradigm/module.

The **one genuinely display-only axis is holistic polysynthesis**. A language is
*labelled* "polysynthetic" once `synthesisIndex ≥ 3.0` (`typology_drift.ts`
`recomputeMorphologicalType`), but the realiser does not pack the clause into a
single polysynthetic verbal word: with a high synthesis index the verb already
incorporates a bare object, but it does **not** additionally stack pronominal
subject/object agreement (and lean on the existing TAM stack) the way a
polysynthetic verb does. A high-synthesis clause therefore surfaces as ordinary
isolating-looking tokens plus one incorporation, not as a holistic
subject+object+TAM+root word.

## G3 wiring target

Wire **polysynthesis** (the flagship) into `translator/realise.ts`:
when the language's own `synthesisIndex` is high (≥ 3.0, the same threshold
`recomputeMorphologicalType` uses to label it polysynthetic), and the verb has
agreement paradigms (`verb.person.*`), stack pronominal **object** agreement onto
the verb in addition to the already-present subject agreement + incorporation +
TAM, so the clause realises as a holistic verbal word. Driven entirely by the
language's own parameters (synthesisIndex + which person paradigms it actually
has) — never an English template. Capped by paradigm availability (no invented
morphology). Locked by a behaviour test.
