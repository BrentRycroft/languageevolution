import { useEffect, useState } from "react";

/**
 * useDebounced.ts
 *
 * Reusable React hooks. Key exports: useDebounced.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
