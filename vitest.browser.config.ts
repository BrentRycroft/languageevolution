import { defineConfig } from "vitest/config";
import { chromium } from "playwright";
import { dirname, join } from "node:path";

/**
 * G7 T3 — browser test project (separate from the default Node/jsdom suite).
 *
 * Runs `*.browser.test.ts` in a real Chromium via Playwright, where `navigator.gpu`
 * exists, so the WebGPU vector kernel is verified against the CPU backend on an
 * actual GPU. The Node suite (vite.config.ts) excludes these files and stays the
 * deterministic default. Run with: `npm run test:gpu`.
 *
 * Headless WebGPU has no discrete GPU, so we point the Vulkan loader at Chromium's
 * bundled SwiftShader ICD (resolved from Playwright's own install) to get a software
 * WebGPU adapter — so the kernel runs on any machine/CI without a GPU.
 */
process.env.VK_ICD_FILENAMES ??= join(dirname(chromium.executablePath()), "vk_swiftshader_icd.json");

export default defineConfig({
  test: {
    include: ["src/**/*.browser.test.ts"],
    browser: {
      enabled: true,
      provider: "playwright",
      name: "chromium",
      headless: true,
      providerOptions: {
        launch: {
          // Full Chrome-for-Testing build (new-headless) — exposes WebGPU, unlike
          // the default chrome-headless-shell.
          channel: "chromium",
          args: [
            "--enable-unsafe-webgpu",
            "--enable-features=Vulkan",
            "--enable-unsafe-swiftshader",
            "--use-vulkan=swiftshader",
            "--disable-vulkan-surface",
          ],
        },
      },
    },
  },
});
