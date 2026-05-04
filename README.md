# languageevolution

Browser-based, modular language-evolution simulator. Run a Proto-language
forward through hundreds of generations and watch its phonology drift, its
grammar typology shift, its lexicon coin and erode, its family-tree split
into daughters that diverge from one another, and its territory grow,
contact, and absorb across a procedural map.

Everything is **deterministic** — a seed string plus a generation count
reproduces every leaf's lexicon, grammar, rule history, sound-correspondence
counts, and event log byte-for-byte — so saved runs and shared seeds
replay exactly.

## What the simulator models

Each generation a leaf language steps through a fixed pipeline of
subsystems, each of which can be toggled in the controls panel:

- **Phonology**
  - Curated catalog of ~80 sound-change rule families (lenition, deletion,
    palatalization, harmony, umlaut, monophthongization, tonogenesis,
    detonogenesis, compensatory lengthening, glottalization, retroflex,
    devoicing, gemination, fortition, metathesis, stress-conditioned
    apocope/syncope, nasalization, aspiration, tap formation, …).
  - Per-rule probability conditioned on word frequency, register,
    erosion-floor, lexical stress, neighbour momentum, and a Wang
    lexical-diffusion S-curve so high-frequency content words lag low-
    frequency words by dozens of generations.
  - OT (optimality-theory) ranking learned online and used as a soft
    filter on candidate outputs.
  - Per-language tone-sandhi (Mandarin-style) for tone systems.
  - Phonotactic-profile-aware repair of forms that violate the language's
    syllable structure.
  - Tier-driven inventory homeostasis: at-tier targets the inventory size,
    and homeostatic mergers prune low-functional-load phonemes when over.
  - Sound-correspondence law tracking: every position-aligned proto→
    daughter substitution is counted, so systematic shifts (Grimm's-Law
    grade) surface in the UI.
- **Lexical genesis**
  - Frequency-direction split (content vs. function) drives erosion vs.
    persistence; "going to" → "gonna" while *mother* / *father* / *water*
    persist.
  - Multiple coinage mechanisms: compounding, derivation (productive
    suffixes, with usage-count attestation thresholds), borrowing,
    reduplication, ideophone, lexical replacement.
  - Targeted derivation pathways from primitive roots into abstract
    nouns ("free + -dom") with a per-tier catch-up window.
  - Inflection classes: every meaning gets a Latin-style 1/2/3/4 bucket
    biased by phonological shape, stable across splits.
- **Grammar / morphology**
  - 50+ grammatical typology axes (word order, case strategy,
    article presence/position, negation position, adjective position,
    interrogative strategy, classifiers, prodrop, …) drift with bias.
  - Per-category paradigms (noun.case, noun.num, verb.tense, verb.aspect,
    verb.voice, …) learn affixes, evolve, and feed inflection.
  - Grammaticalisation pathways from semantic source to discourse target
    (interrogative pronouns → topic markers, etc.).
  - Suppletion (go/went) preserved by Phase-28e analogy gate.
  - Derivational suffix productivity tracked (rule established when
    attestations cross threshold).
- **Semantics**
  - Cluster-based drift, semantic recarving, kinship-system
    simplification at literacy onset, taboo-driven replacement,
    polysemy-aware coinage commit.
- **Tree**
  - Daughters split, perturbing enabled-rule sets and weights.
  - Founder innovations (one-shot grammar / phonology shifts) at split.
  - Death pressure under capacity overshoot, with closeness-based
    diversity protection.
  - Contact (loanwords, areal phonology, areal-typology pressure waves).
  - Creolization when contacting populations merge.
- **Geography**
  - Procedural or Earth-bitmap maps with per-cell biomes.
  - Territory growth, contestation, and reabsorption (extinct
    territory diffuses into living neighbours).
- **Time-varying volatility**
  - Each language oscillates between long stable centuries and short
    upheavals (Norman conquest, Great Vowel Shift) — phonology and
    grammar rates multiplied accordingly.

## Presets

Six preset families ship out of the box, each with a hand-curated seed
lexicon, phonotactic profile, phoneme inventory, frequency hints, stress
pattern, and infinitive strategy. From `src/engine/presets/`:

- **default** — generic Indo-European-ish proto.
- **pie** — Proto-Indo-European with laryngeals (h₁, h₂, h₃),
  syllabic resonants, lexical-stress overrides.
- **germanic** — Proto-Germanic.
- **romance** — Latin-shaped seed with Romance-typical phonotactics.
- **bantu** — noun-class (Bantu)-style morphology with prenasalised stops.
- **english** — Modern English seed with comprehensive frequency hints.
- **tokipona** — toy phonology (CV-only, ~14 phonemes).

## Running

```bash
npm install
npm run dev              # opens the simulator at http://localhost:5173
npm test                 # vitest, default suite (≤ 5 min)
npm run test:slow        # full surface — adds heavy multi-hundred-gen tests
npm run build            # production bundle to dist/
npm run preview          # serves dist/ locally (with base path)
```

To regenerate PNG icons from `public/icon.svg` (not needed for a normal
build — the PNGs are committed):

```bash
npm install --no-save sharp
node scripts/gen-icons.mjs
```

## Hosting & installing on your phone

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds on every push to `main` and deploys to **GitHub Pages**. The
deployed URL is:

```
https://brentrycroft.github.io/languageevolution/
```

To enable it: in the repo on GitHub, **Settings → Pages → Build and
deployment → Source: GitHub Actions**. Then merge to `main`; the workflow
builds, runs tests, and publishes `dist/` to Pages.

### Installing on iPhone / iPad

1. Open the hosted URL in **Safari** on iOS.
2. Tap the Share button → **Add to Home Screen**.
3. Launch from the home-screen icon — it opens full-screen with the status
   bar styled to match the app.

The app is a Progressive Web App (manifest + service worker via
`vite-plugin-pwa`), so it caches for offline use once loaded. Saved runs
persist in `localStorage` across launches.

Android/Chrome installs the same way via the browser's "Install app" /
"Add to Home screen" menu.

## Code layout

```
src/
  engine/                   # framework-free TS simulation core
    achievements/           # narrative milestones (first split, etc.)
    analysis/               # cross-leaf analysis utilities
    contact/                # borrowing + areal phonology
    genesis/                # lexical-coinage mechanisms (compound, derive, …)
    geo/                    # procedural + earth maps, biomes, territory
    grammar/                # grammar-feature defaults, drift logic
    lexicon/                # tier targets, derivation, words table, frequency
    morphology/             # paradigms, inflection classes, gender, analogy
    narrative/              # narrative templates + composer (myth, legend, …)
    phonology/              # IPA, sound-change catalog, OT, sandhi, soundLaws
    presets/                # 6 preset language families
    semantics/              # clusters, kinship, recarve, taboo
    steps/                  # per-generation pipeline (phonology, grammar, …)
    translator/             # English ↔ target translator + reverse glossing
    tree/                   # splitting daughters, founder innovations
    utils/                  # cloning, etc.
    config.ts, simulation.ts, types.ts, rng.ts, …
  state/                    # Zustand store (with playback, history)
  persistence/              # versioned save/load + autosave + migrations
  share/                    # URL-encoded shareable runs
  ui/                       # React components — ~50 panels:
                            #   LexiconView, GrammarView, MapView, TreeView,
                            #   Translator, EventsLog, SoundLawsView,
                            #   PhonemeInventoryView, DictionaryView, …
```

The engine has zero React imports — `src/engine/` is pure TypeScript and
runs inside a Web Worker (`worker.ts`) when the UI offloads playback.

## Using the app

1. Pick a preset (or stay on **default**).
2. Press **Play** — the lexicon mutates, sound changes accumulate, and
   (after ~15 gens) the tree branches into daughter languages.
3. Click any cell in the lexicon table to select a (language, meaning);
   the timeline chart then traces that word's Levenshtein distance from
   its seed form.
4. Open the **Translator** tab to enter English and see it rendered in
   the selected language with morphology + word-order + reverse-glossing.
5. Open **Sound Laws** to see active rules, retired rules, and the
   regular phoneme→phoneme correspondences the daughter has built up.
6. Open **Map** to see territory, biome, contact, and areal pressure.
7. Toggle individual sound changes or whole subsystems (volatility,
   areal, contact, learner, copula, …) in the **Controls** panel.
8. Save a run; reload the page; load it back to resume from the same
   state. URL-share to send another browser the seed + replay snapshot.
