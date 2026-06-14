# G7 — GPU / Client Offload — Design

**Date:** 2026-06-13 · **Sub-project:** G7 ([roadmap](2026-06-13-geometry-native-program-roadmap.md)) · **Depends on:** G0, G1, G2
**Branch:** `auto/storage-pointnative` · **Status:** Approved (streamlined).

## Goal

Offload the heavy vector math to the GPU (**WebGPU**) so it runs fast on the user's machine,
with a CPU fallback. The app is already a client-side SPA (no server compute), so "offload to the
user" is about **GPU acceleration of the hot geometric kernels**, which G1/G2 make pervasive.

## Background — what's hot, and a key property

- **Hot batch kernels** (O(vocab) per call, called per resolution/drift/coinage, ~2,244-wide):
  `embeddings.nearestMeanings` (argmax cosine over the embedding matrix), `neighbors.geometricNeighbors`
  (top-k), `anchorQueries.clusterRegionOf` (nearest centroid), `anchors.nearestAnchor`. As G1/G2 make
  meaning resolution geometric everywhere, these dominate.
- **The math is fixed-point integer** (`vec.ts`: `dotFixed`/`cosineFixed`/`distanceSq` over int8-quantized
  `Vec`) — which is *why* the engine is currently cross-machine byte-identical. Porting the **integer**
  kernels to GPU keeps determinism (G0's per-machine relaxation is then a safety margin, not a necessity).

## Decisions

1. **A `vectorBackend` abstraction** with two implementations: **CPU** (the existing code) and
   **WebGPU** (compute shaders), capability-detected at startup (`navigator.gpu`). CPU is the fallback
   when WebGPU is absent (and in CI/tests).
2. **Port the batch kernels** (`nearestMeanings`/`geometricNeighbors`/`clusterRegionOf`) as integer
   compute shaders: the embedding matrix lives in a GPU buffer; cosine + argmax/top-k run on-device.
3. **Batch, don't block.** WebGPU is async; the engine step is sync. The GPU accelerates **batchable
   bulk precomputation** (e.g. the full nearest-meaning / neighbor graph computed once per generation),
   which the sync step then reads; incidental one-off lookups stay on the CPU path. This keeps the
   deterministic inner loop sync.
4. **Reproducibility:** integer kernels are deterministic; the GPU and CPU backends must produce
   **identical** integer results (kernel-equivalence test). G0's per-machine gate runs on whichever
   backend the machine uses; CI runs CPU.

## Determinism & testing

- Kernel-equivalence test: GPU backend == CPU backend (exact, for integer kernels) on a fixed input
  matrix (run where WebGPU is available; skipped in CI without GPU).
- Reproducibility (G0) green on the active backend.
- Perf benchmark: measurable speedup of the geometric phase with the WebGPU backend on a GPU machine
  (the success metric).

## Risks

- **WebGPU availability** — fallback is mandatory; the app must work identically (just slower) without
  a GPU.
- **Async integration** — strictly batch GPU work per generation; never await inside the deterministic
  per-word loop.
- **CI has no GPU** — the GPU path is behind the capability gate + a where-available test; CPU path is
  the CI-tested default.
- Keep integer/fixed-point to preserve determinism; only move to float GPU if a kernel can't be
  expressed in integer (then it's per-machine only, which G0 permits).

## Success criteria

1. A `vectorBackend` with CPU + WebGPU implementations, capability-detected, CPU fallback.
2. The hot batch kernels run on WebGPU when available, producing identical integer results to CPU.
3. Measurable speedup on a GPU machine; reproducibility green; full suite green on the CPU path.
