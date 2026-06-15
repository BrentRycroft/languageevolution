import { describe, it, expect } from "vitest";
import { getGpuDevice, gpuSquaredDistances } from "../vectorBackend.webgpu";
import { distanceSq, VEC_DIM, type Vec } from "../vec";
import { ANCHORS } from "../anchors";

/**
 * G7 T3 — WebGPU kernel ↔ CPU equivalence (browser mode), at production scale.
 *
 * Runs the WebGPU squared-distance compute shader in a real Chromium (vitest browser
 * mode + Playwright; SwiftShader software adapter) over REAL anchor vectors, whose
 * summed squared distances exceed 2³¹ — so this exercises the 64-bit accumulation
 * path. Asserts the GPU result is integer-EXACT vs the CPU `distanceSq` loop, and that
 * the nearest-row argmin agrees. Skips (does not fail) when no WebGPU adapter exists.
 */
describe("G7 T3 — WebGPU squared-distance kernel ↔ CPU equivalence (real scale)", () => {
  it("GPU 64-bit squared distances are integer-exact vs CPU, and argmin agrees", async (ctx) => {
    const device = await getGpuDevice();
    if (!device) {
      console.warn("[G7] WebGPU adapter unavailable in this Chromium config — skipping.");
      ctx.skip();
      return;
    }

    const n = 64;
    const rows: Vec[] = ANCHORS.slice(0, n).map((a) => a.point);
    const query = ANCHORS[100]!.point; // a real, distant point → large (i32-overflowing) distances

    const flat = new Int32Array(n * VEC_DIM);
    for (let i = 0; i < n; i++) flat.set(rows[i]!, i * VEC_DIM);

    const cpu = rows.map((r) => distanceSq(r, query));
    const gpu = await gpuSquaredDistances(device, flat, n, VEC_DIM, query);

    // The test is only meaningful if it actually exercises the >2³¹ (64-bit) path.
    expect(Math.max(...cpu)).toBeGreaterThan(2 ** 31);

    expect(gpu.length).toBe(n);
    for (let i = 0; i < n; i++) expect(gpu[i], `row ${i}`).toBe(cpu[i]);

    // Nearest-row argmin agrees (the kernel's job for nearestAnchor/topK).
    const argmin = (xs: number[]) => xs.reduce((best, v, i) => (v < xs[best]! ? i : best), 0);
    expect(argmin(gpu)).toBe(argmin(cpu));

    device.destroy();
  });
});
