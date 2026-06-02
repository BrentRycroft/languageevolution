import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const repo = "languageevolution";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${repo}/` : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icon.svg",
        "icons/apple-touch-icon.png",
        "icons/favicon-32.png",
      ],
      manifest: {
        name: "Language Evolution Simulator",
        short_name: "LangEvo",
        description:
          "A browser-based modular simulator for phonological drift, word genesis, grammar evolution, and family-tree divergence.",
        theme_color: "#0f1115",
        background_color: "#0f1115",
        display: "standalone",
        orientation: "any",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        // Hard denylist so Workbox never serves `index.html` in place of a
        // JS / WASM / asset fetch. Browsers seeing text/html where they
        // expected a script trigger a full page reload — which wipes the
        // running simulation in memory.
        navigateFallbackDenylist: [
          /\/assets\//,
          /\.(?:js|css|wasm|bin|json|map)$/,
        ],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
  test: {
    // Default to the lightweight `node` environment. Booting jsdom per
    // test FILE is expensive, and ~225 of the ~235 test files are pure
    // engine logic with no DOM access. Only the UI tests and the
    // persistence tests (which touch localStorage) need a browser
    // environment; those are matched below. This keeps the default
    // suite from paying the jsdom-boot cost ~225 times.
    environment: "node",
    environmentMatchGlobs: [
      ["**/*.test.tsx", "jsdom"],
      ["**/ui/**", "jsdom"],
      ["**/persistence/**", "jsdom"],
    ],
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Long-running property + multi-thousand-generation smoke tests
    // are gated behind RUN_SLOW=1 so the default `npm test` returns
    // under 90s. CI / pre-push runs `npm run test:slow` for the full
    // surface.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ...(process.env.RUN_SLOW
        ? []
        : [
            "**/properties.test.ts",
            "**/smoke_2k.test.ts",
            "**/lexicogenesis_e2e.test.ts",
            "**/presets.test.ts",
            "**/render_every_tab.test.tsx",
            // Phase 29 Tranche 7g: heavyweight multi-hundred-gen tests
            // exceed the 5-minute CI budget when included alongside
            // the full default suite. Gated behind RUN_SLOW=1 so the
            // default `npm test` stays well under budget. CI / pre-push
            // runs `npm run test:slow` for the full surface.
            "**/divergence_regression.test.ts",
            "**/realism_scorecard.test.ts",
            "**/integration_e2e.test.ts",
            "**/sprint4_realism_polish.test.ts",
            "**/rate_calibration.test.ts",
            "**/genesis_mechanisms.test.ts",
            // Multi-hundred-generation behaviour suites: each test runs a
            // full growing-tree simulation for minutes. Every test in
            // these files is heavy (no fast units to preserve), so they
            // gate cleanly at the file level. Run via `npm run test:slow`.
            "**/phase72e_stress_tests.test.ts",
            "**/pacing.test.ts",
            "**/stagnation.test.ts",
            "**/soft_cap.test.ts",
            "**/phase73d_historical_preserved.test.ts",
            // historical.test.ts is predominantly heavy: many tests run
            // multi-hundred-generation Romance+historical simulations (several
            // 200-gen, one ~440s under full-suite load), so it was silently
            // bloating the fast PR tier. A handful of cheap schedule/voice
            // config units also live here; if fast-tier coverage of those is
            // wanted later, split them into a light file. Gated wholesale for
            // now to keep `npm test` fast.
            "**/historical.test.ts",
            "**/achievements.test.ts",
            "**/procedural_integration.test.ts",
            "**/targeted_derivation_integration.test.ts",
            "**/ablaut_chain.test.ts",
            "**/phase72f_socioling.test.ts",
            "**/phase72a_quick_wins.test.ts",
            "**/cognates.test.ts",
            // Long-run typological-divergence probes: each asserts that
            // sister lineages drift apart over hundreds of generations, so
            // the generation count is intrinsic and can't be shortened
            // without changing what's measured. Nightly tier.
            "**/phase73a_divergence.test.ts",
            "**/phase73d_typology_divergence.test.ts",
            "**/phase73d_synthesis_divergence.test.ts",
            "**/frequency_direction.test.ts",
          ]),
    ],
  },
}));
