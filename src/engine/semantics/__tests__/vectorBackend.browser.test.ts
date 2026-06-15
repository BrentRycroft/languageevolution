import { describe, it, expect } from "vitest";
import { getGpuDevice, gpuSquaredDistances } from "../vectorBackend.webgpu";
import { distanceSq, VEC_DIM, type Vec } from "../vec";

/**
 * G7 T3 feasibility spike — WebGPU kernel ↔ CPU equivalence (browser mode).
 *
 * Proves the WebGPU compute pipeline runs in a real Chromium (via vitest browser
 * mode + Playwright) and the GPU squared-distance kernel returns results
 * byte-identical to the deterministic CPU `distanceSq` loop. Skips (does not fail)
 * when no WebGPU adapter is available, so the runner reports availability clearly.
 */

// Deterministic small-valued VEC_DIM row (values in [-100,100] keep Σ(diff²) inside i32).
function makeRow(seed: number): Vec {
  const v = new Int32Array(VEC_DIM);
  let s = (seed * 2654435761) >>> 0;
  for (let i = 0; i < VEC_DIM; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    v[i] = ((s >>> 8) % 201) - 100;
  }
  return v;
}

describe("G7 T3 — WebGPU squared-distance kernel ↔ CPU equivalence", () => {
  it("GPU squared distances are byte-identical to the CPU distanceSq loop", async (ctx) => {
    const device = await getGpuDevice();
    if (!device) {
      console.warn("[G7] WebGPU adapter unavailable in this Chromium config — skipping.");
      ctx.skip();
      return;
    }

    const n = 64;
    const rows: Vec[] = Array.from({ length: n }, (_, i) => makeRow(i + 1));
    const query = makeRow(999);

    const flat = new Int32Array(n * VEC_DIM);
    for (let i = 0; i < n; i++) flat.set(rows[i]!, i * VEC_DIM);

    const cpu = rows.map((r) => distanceSq(r, query));
    const gpu = await gpuSquaredDistances(device, flat, n, VEC_DIM, query);

    expect(gpu.length).toBe(n);
    for (let i = 0; i < n; i++) {
      expect(gpu[i], `row ${i}`).toBe(cpu[i]);
    }
    device.destroy();
  });
});
