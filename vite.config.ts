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
          "A browser-based modular simulator for phonological drift, agent-based communication, and language family divergence.",
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
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"],
      },
    }),
  ],
  test: {
    environment: "node",
    globals: true,
  },
}));
