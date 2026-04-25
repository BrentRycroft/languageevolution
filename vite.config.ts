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
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
}));
