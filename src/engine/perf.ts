/**
 * Lightweight performance instrumentation.
 *
 * Audit (Phase 19 plan C3) flagged that there's no way to profile hot
 * paths. This module gives every step subsystem a `mark(label)` call that
 * records a `performance.mark` + `performance.measure` from the previous
 * mark, so users can read a flame-chart-style breakdown via DevTools'
 * Performance panel without any code change at the call site.
 *
 * Marks are no-ops in environments where `performance.mark` is missing
 * (some workers, older browsers).
 *
 * Names are scoped under `lev:` prefix so they're easy to filter.
 */

const PREFIX = "lev:";

let lastMarkName: string | null = null;

const SUPPORTS =
  typeof performance !== "undefined" &&
  typeof performance.mark === "function" &&
  typeof performance.measure === "function";

/**
 * Record a step-boundary mark. If a previous mark is in scope (within the
 * current frame), also record a `measure` from it to this one labelled
 * `lev:<prev>→<this>`.
 */
export function mark(label: string): void {
  if (!SUPPORTS) return;
  const name = `${PREFIX}${label}`;
  try {
    performance.mark(name);
    if (lastMarkName) {
      performance.measure(`${lastMarkName}→${label}`, lastMarkName, name);
    }
    lastMarkName = name;
  } catch {
    // performance.mark can throw for invalid names; swallow to avoid breaking step().
  }
}

/** Reset the "previous mark" reference. Call at the top of each step(). */
export function resetMarks(): void {
  lastMarkName = null;
}

/**
 * Run a function, marking before and after. Convenience wrapper that
 * preserves the return value.
 */
export function timed<T>(label: string, fn: () => T): T {
  mark(`${label}.start`);
  try {
    return fn();
  } finally {
    mark(`${label}.end`);
  }
}
