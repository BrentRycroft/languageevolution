/// <reference types="@webgpu/types" />
/**
 * vectorBackend.webgpu.ts — G7 T3 WebGPU compute backend (browser only).
 *
 * Computes the integer squared-distance vector (query vs every matrix row) on the
 * GPU — the O(N·D) kernel behind nearestAnchor / kNearestAnchors / clusterRegionOf.
 * Browser-only (`navigator.gpu`); verified against the deterministic CPU backend by
 * the browser equivalence test (`*.browser.test.ts`, run via vitest browser mode).
 *
 * Integer-exact at production scale: the sum of squared diffs over 58 quantized
 * GloVe dims reaches ~10¹¹, overflowing i32, so the shader accumulates a 64-bit
 * value as a (lo, hi) u32 pair with manual carry — exactly reproducing the CPU
 * `distanceSq` (which accumulates in a float64, exact below 2⁵³). Each term `diff²`
 * is computed in u32 (|diff| ≤ ~49k ⇒ diff² < 2³²), so no single term overflows
 * either. Results reconstruct in JS as `lo + hi·2³²`.
 */

const SQ_DIST_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> matrix : array<i32>;        // n * d, row-major
@group(0) @binding(1) var<storage, read> query  : array<i32>;        // d
@group(0) @binding(2) var<storage, read_write> result : array<u32>;  // n*2: [lo, hi] per row
@group(0) @binding(3) var<uniform> dims : vec2<u32>;                  // (n, d)

// Full 32×32 → 64-bit unsigned product as (lo, hi). u32 multiply wraps at 32 bits,
// so a single term diff² can exceed 32 bits (|diff| can top 2¹⁶); split into 16-bit
// halves and reassemble with carries.
fn mul32(a : u32, b : u32) -> vec2<u32> {
  let aL = a & 0xFFFFu; let aH = a >> 16u;
  let bL = b & 0xFFFFu; let bH = b >> 16u;
  let ll = aL * bL;
  let lh = aL * bH;
  let hl = aH * bL;
  let hh = aH * bH;
  var lo = ll;
  var hi = hh;
  // add (lh << 16)
  let s1 = lo + (lh << 16u); if (s1 < lo) { hi = hi + 1u; } lo = s1; hi = hi + (lh >> 16u);
  // add (hl << 16)
  let s2 = lo + (hl << 16u); if (s2 < lo) { hi = hi + 1u; } lo = s2; hi = hi + (hl >> 16u);
  return vec2<u32>(lo, hi);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let n = dims.x;
  let d = dims.y;
  if (i >= n) { return; }
  var lo : u32 = 0u;
  var hi : u32 = 0u;
  let base = i * d;
  for (var j : u32 = 0u; j < d; j = j + 1u) {
    let diff = matrix[base + j] - query[j];
    let ad = u32(abs(diff));
    let sq = mul32(ad, ad);            // exact 64-bit diff²
    let newLo = lo + sq.x;
    if (newLo < lo) { hi = hi + 1u; }  // carry from the low add
    lo = newLo;
    hi = hi + sq.y;                     // high half of diff²
  }
  result[i * 2u] = lo;
  result[i * 2u + 1u] = hi;
}
`;

/** Acquire a GPU device, or null when WebGPU / an adapter is unavailable. */
export async function getGpuDevice(): Promise<GPUDevice | null> {
  const gpu = (globalThis.navigator as Navigator | undefined)?.gpu;
  if (!gpu) {
    console.warn("[G7] navigator.gpu is undefined (WebGPU not exposed by this browser/flags)");
    return null;
  }
  let adapter = await gpu.requestAdapter();
  if (!adapter) {
    console.warn("[G7] requestAdapter() returned null; retrying with forceFallbackAdapter");
    adapter = await gpu.requestAdapter({ forceFallbackAdapter: true });
  }
  if (!adapter) {
    console.warn("[G7] no WebGPU adapter (incl. software fallback)");
    return null;
  }
  return adapter.requestDevice();
}

/**
 * Squared distance from `query` to every row of `matrix` (n rows × d dims, row-major),
 * computed on the GPU. Integer-exact (64-bit accumulation), equal to the CPU
 * `distanceSq` for every row. Returns one exact number per row (`lo + hi·2³²`).
 */
export async function gpuSquaredDistances(
  device: GPUDevice,
  matrix: Int32Array,
  n: number,
  d: number,
  query: Int32Array,
): Promise<number[]> {
  // The runtime arrays are always ArrayBuffer-backed (never SharedArrayBuffer);
  // cast only at the GPU write boundary to satisfy writeBuffer's stricter type.
  const asGpuSrc = (a: Int32Array): Int32Array<ArrayBuffer> => a as Int32Array<ArrayBuffer>;

  const matrixBuf = device.createBuffer({
    size: matrix.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(matrixBuf, 0, asGpuSrc(matrix));

  const queryBuf = device.createBuffer({
    size: query.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(queryBuf, 0, asGpuSrc(query));

  const resultBytes = n * 2 * 4; // (lo, hi) u32 per row
  const resultBuf = device.createBuffer({
    size: resultBytes,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // vec2<u32> needs 8 bytes; a uniform buffer's min binding size is 16, so pad.
  const dimsBuf = device.createBuffer({
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(dimsBuf, 0, new Uint32Array([n, d]));

  const module = device.createShaderModule({ code: SQ_DIST_SHADER });
  const pipeline = device.createComputePipeline({
    layout: "auto",
    compute: { module, entryPoint: "main" },
  });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: matrixBuf } },
      { binding: 1, resource: { buffer: queryBuf } },
      { binding: 2, resource: { buffer: resultBuf } },
      { binding: 3, resource: { buffer: dimsBuf } },
    ],
  });

  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(n / 64));
  pass.end();

  const staging = device.createBuffer({
    size: resultBytes,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyBufferToBuffer(resultBuf, 0, staging, 0, resultBytes);
  device.queue.submit([encoder.finish()]);

  await staging.mapAsync(GPUMapMode.READ);
  const u = new Uint32Array(staging.getMappedRange().slice(0));
  staging.unmap();
  for (const b of [matrixBuf, queryBuf, resultBuf, dimsBuf, staging]) b.destroy();

  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = u[i * 2]! + u[i * 2 + 1]! * 4294967296; // lo + hi·2³²
  return out;
}
