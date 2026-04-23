import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const repo = "languageevolution";

export default defineConfig(({ command }) => ({
  base: command === "build" ? `/${repo}/` : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Isolate the WebLLM runtime (large, optional, lazy-loaded).
          if (id.includes("@mlc-ai/web-llm")) return "webllm";
        },
      },
    },
  },
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
        // JS / WASM / asset fetch. Without this, a slow or failed WebLLM
        // chunk load (6+ MB) would be intercepted by the navigate-fallback
        // rule and the browser would see text/html where it expected a
        // script, triggering a full page reload — which wipes the running
        // simulation in memory. See issue surfaced in PR 3 autosave work.
        navigateFallbackDenylist: [
          /\/assets\//,
          /\.(?:js|css|wasm|bin|json|map)$/,
          /webllm/,
        ],
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"],
        // The WebLLM chunk is 6+ MB and only loaded when the user opts in.
        // Exclude it from the precache manifest; Workbox will still cache it
        // on demand as the browser fetches it.
        globIgnores: ["**/webllm-*.js"],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
}));
