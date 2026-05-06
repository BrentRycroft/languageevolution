/**
 * Phase 46b: per-module profiling.
 *
 * Wraps every `step` and `realise` hook with a timer (using
 * `performance.now()` when available, `Date.now()` as fallback for
 * environments without the high-res clock). Surfaces a per-module
 * cost breakdown the UI can render.
 *
 * The profiler is opt-in via `enableProfiling()` — a no-op when
 * disabled, so production runs pay no overhead. When enabled,
 * costs accumulate in a global per-module table read by the
 * Performance UI panel.
 *
 * Cost model:
 *   - `step`     timed at each per-leaf-per-gen step call
 *   - `realise`  timed at each pipeline-stage hook call
 *   - costs are reported in **total ms over the profiling window**;
 *     UI divides by gen count for per-gen averages.
 */

let enabled = false;

/**
 * Per-module cost record. Keyed by module id.
 */
export interface ModuleCost {
  stepMs: number;
  realiseMs: number;
  stepCalls: number;
  realiseCalls: number;
}

const COSTS = new Map<string, ModuleCost>();

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function ensure(id: string): ModuleCost {
  let c = COSTS.get(id);
  if (!c) {
    c = { stepMs: 0, realiseMs: 0, stepCalls: 0, realiseCalls: 0 };
    COSTS.set(id, c);
  }
  return c;
}

/**
 * Turn the profiler on. Costs accumulate in COSTS until the next
 * `resetProfiler()` call.
 */
export function enableProfiling(): void {
  enabled = true;
}

/**
 * Turn the profiler off. Subsequent timer calls are no-ops.
 */
export function disableProfiling(): void {
  enabled = false;
}

export function isProfilingEnabled(): boolean {
  return enabled;
}

/**
 * Record `ms` against module `id`'s step cost. Increments call
 * count regardless of `ms` magnitude. No-op when disabled.
 */
export function recordStepCost(id: string, ms: number): void {
  if (!enabled) return;
  const c = ensure(id);
  c.stepMs += ms;
  c.stepCalls += 1;
}

/**
 * Record `ms` against module `id`'s realise cost.
 */
export function recordRealiseCost(id: string, ms: number): void {
  if (!enabled) return;
  const c = ensure(id);
  c.realiseMs += ms;
  c.realiseCalls += 1;
}

/**
 * Returns a copy of the current cost table sorted by total cost
 * (step + realise) descending — the UI's natural display order.
 */
export function getProfileSnapshot(): Array<{ id: string; cost: ModuleCost }> {
  const out: Array<{ id: string; cost: ModuleCost }> = [];
  for (const [id, cost] of COSTS) {
    out.push({ id, cost: { ...cost } });
  }
  out.sort((a, b) => {
    const tA = a.cost.stepMs + a.cost.realiseMs;
    const tB = b.cost.stepMs + b.cost.realiseMs;
    return tB - tA;
  });
  return out;
}

/**
 * Clear all accumulated costs. Useful at the start of a profiling
 * window or between regression-test runs.
 */
export function resetProfiler(): void {
  COSTS.clear();
}

/**
 * Convenience wrapper: time `fn`'s execution and record against
 * `id`'s step cost. Returns whatever `fn` returns.
 */
export function timeStep<T>(id: string, fn: () => T): T {
  if (!enabled) return fn();
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    recordStepCost(id, nowMs() - t0);
  }
}

/**
 * Convenience wrapper: time `fn`'s execution and record against
 * `id`'s realise cost.
 */
export function timeRealise<T>(id: string, fn: () => T): T {
  if (!enabled) return fn();
  const t0 = nowMs();
  try {
    return fn();
  } finally {
    recordRealiseCost(id, nowMs() - t0);
  }
}
