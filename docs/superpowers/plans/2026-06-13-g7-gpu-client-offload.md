# G7 — GPU / Client Offload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** WebGPU-accelerate the hot integer vector kernels behind a capability-detected backend with a CPU fallback, batched per generation, identical results to CPU.

**Reference spec:** `docs/superpowers/specs/2026-06-13-g7-gpu-client-offload-design.md`
**Depends on:** G0 (reproducibility model), G1/G2 (final geometric math). **Defer execution to a subagent.**

---

## Task 1: `vectorBackend` abstraction (CPU default)

- [ ] **Step 1 (test):** Unit test — `getVectorBackend()` returns a backend exposing `nearestMeanings(matrix, query)` / `topKNeighbors(matrix, query, k)` / `nearestCentroid(point, centroids)`; the default CPU backend matches the existing `cosineFixed`/argmax results. Run → FAIL.
- [ ] **Step 2 (impl):** Create `src/engine/semantics/vectorBackend.ts`: a `VectorBackend` interface + a CPU implementation wrapping the existing integer ops. Route `nearestMeanings`/`geometricNeighbors`/`clusterRegionOf` through `getVectorBackend()`. Run → PASS. `tsc` clean. Commit.

## Task 2: Per-generation batch precompute hook

- [ ] **Step 1:** Add a per-generation batch step that precomputes the bulk geometric queries (nearest-meaning / neighbor graph) once and caches them for the sync inner loop to read. Verify `RUN_SLOW=1 npx vitest run --dir src reproducibility` stays green (CPU backend, deterministic). `tsc` clean. Commit.

## Task 3: WebGPU backend

- [ ] **Step 1:** Implement a WebGPU `VectorBackend` in `vectorBackend.webgpu.ts`: upload the int embedding matrix to a GPU buffer; compute shaders for batched integer cosine + argmax/top-k; capability-detect `navigator.gpu` in `getVectorBackend()` (WebGPU when present, else CPU).
- [ ] **Step 2 (equivalence test):** A test (skipped when `navigator.gpu` is undefined) asserting the WebGPU backend returns **identical** integer results to the CPU backend on a fixed matrix + queries. `tsc` clean. Commit.

## Task 4: Benchmark + verify

- [ ] **Step 1:** Add a perf benchmark (behind `RUN_SLOW` or a bench script) timing the geometric phase on CPU vs WebGPU; record the speedup where a GPU is present.
- [ ] **Step 2:** `npx vitest run --dir src` (FAST) green on the CPU path; once `RUN_SLOW=1` green; reproducibility green; `tsc` clean. Confirm the app runs identically (slower) with WebGPU disabled.

---

## Self-review

**Coverage:** backend abstraction + CPU (T1), batch precompute (T2), WebGPU backend + equivalence (T3), benchmark + verify (T4). **Placeholders:** none — shaders authored in T3 with an equivalence test for acceptance. **Determinism:** integer kernels; CPU is the CI-tested default; GPU behind capability gate; batched per generation (never await in the inner loop).
