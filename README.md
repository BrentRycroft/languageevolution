# languageevolution

Browser-based modular language evolution simulator.

Two evolutionary dynamics, each toggleable at runtime:

- **Phonological drift** — a curated catalog of sound changes (p→f, k→h/_V,
  intervocalic voicing, final-vowel deletion, nasal place assimilation,
  palatalization, vowel raising, metathesis, …) applied per generation with
  word-contextual probabilities.
- **Family-tree divergence** — languages split into daughter languages.
  Each daughter deep-copies the parent's lexicon; one gets a perturbation to
  its enabled sound changes so divergence is visible.

Everything is deterministic — a seed string plus generation count reproduces
state byte-for-byte — so saved runs replay exactly.

## Running

```bash
npm install
npm run dev              # opens the simulator at http://localhost:5173
npm test                 # vitest
npm run build            # production bundle to dist/
npm run preview          # serves dist/ locally (with base path)
```

To regenerate PNG icons from `public/icon.svg` (not needed for a normal build —
the PNGs are committed):

```bash
npm install --no-save sharp
node scripts/gen-icons.mjs
```

## Hosting & installing on your phone

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`)
that builds on every push to `main` and deploys to **GitHub Pages**. The
deployed URL will be:

```
https://brentrycroft.github.io/languageevolution/
```

To enable it: in the repo on GitHub, **Settings → Pages → Build and deployment
→ Source: GitHub Actions**. Then merge this branch into `main`; the workflow
builds, runs tests, and publishes `dist/` to Pages.

### Installing on iPhone / iPad

1. Open the hosted URL in **Safari** on iOS.
2. Tap the Share button → **Add to Home Screen**.
3. Launch from the home-screen icon — it opens full-screen with the status
   bar styled to match the app, no Safari chrome.

The app is a Progressive Web App (manifest + service worker via
`vite-plugin-pwa`), so it also caches for offline use once loaded. Saved
runs persist in `localStorage` across launches.

Android/Chrome installs the same way via the browser's "Install app" /
"Add to Home screen" menu.

## Code layout

```
src/
  engine/          # framework-free TS simulation core
    rng.ts         # Mulberry32 + FNV-1a seed hash
    types.ts
    phonology/     # ipa, catalog of sound changes, apply logic
    tree/          # splitting daughter languages
    lexicon/       # default Swadesh-style seed lexicon
    simulation.ts  # orchestrator
    config.ts
  state/           # Zustand store
  ui/              # React components
  persistence/     # localStorage save/load
```

The engine has zero React imports and could be moved into a Web Worker.

## Using the app

1. Press **Play** — you'll see the lexicon mutate and (after ~15 gens) the
   tree branch into daughter languages.
2. Click any cell in the lexicon table to select a (language, meaning);
   the timeline chart then traces that word's Levenshtein distance from its
   seed form.
3. Toggle individual sound changes on/off, or tune their weights, in the
   **Sound changes** section of the controls panel.
4. Save a run; reload the page; load it back to resume from the same state.
