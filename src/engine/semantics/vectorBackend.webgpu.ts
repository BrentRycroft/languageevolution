/// <reference types="@webgpu/types" />
/**
 * vectorBackend.webgpu.ts — G7 T3 WebGPU compute backend (browser only).
 *
 * Computes the integer squared-distance vector (query vs every matrix row) on the
 * GPU — the O(N·D) kernel behind nearestAnchor / kNearestAnchors / clusterRegionOf.
 * Browser-only (`navigator.gpu`); verified against the deterministic CPU backend by
 * the browser equivalence test (`*.browser.test.ts`, run via vitest browser mode).
 *
 * SPIKE SCOPE: accumulates the sum of squared diffs in `i32`, which is exact only
 * while Σ(diff²) < 2³¹. Small inputs (the equivalence test) stay exact; the
 * production 58-dim GloVe vectors can overflow i32, so integer-exact-at-scale needs
 * emulated 64-bit accumulation — a follow-up once this proves the pipeline works.
 */

const SQ_DIST_SHADER = /* wgsl */ `
@group(0) @binding(0) var<storage, read> matrix : array<i32>;        // n * d, row-major
@group(0) @binding(1) var<storage, read> query  : array<i32>;        // d
@group(0) @binding(2) var<storage, read_write> result : array<i32>;  // n
@group(0) @binding(3) var<uniform> dims : vec2<u32>;                  // (n, d)

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid : vec3<u32>) {
  let i = gid.x;
  let n = dims.x;
  let d = dims.y;
  if (i >= n) { return; }
  var acc : i32 = 0;
  let base = i * d;
  for (var j : u32 = 0u; j < d; j = j + 1u) {
    let diff = matrix[base + j] - query[j];
    acc = acc + diff * diff;
  }
  result[i] = acc;
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
 * computed on the GPU. Integer result, byte-identical to the CPU `distanceSq` loop
 * while the accumulator stays within i32 (see SPIKE SCOPE).
 */
export async function gpuSquaredDistances(
  device: GPUDevice,
  matrix: Int32Array,
  n: number,
  d: number,
  query: Int32Array,
): Promise<Int32Array> {
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

  const resultBuf = device.createBuffer({
    size: n * 4,
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
    size: n * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  encoder.copyBufferToBuffer(resultBuf, 0, staging, 0, n * 4);
  device.queue.submit([encoder.finish()]);

  await staging.mapAsync(GPUMapMode.READ);
  const out = new Int32Array(staging.getMappedRange().slice(0));
  staging.unmap();

  for (const b of [matrixBuf, queryBuf, resultBuf, dimsBuf, staging]) b.destroy();
  return out;
}
