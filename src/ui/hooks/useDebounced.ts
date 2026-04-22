import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stayed stable for `delayMs` milliseconds.
 * Use to avoid re-running expensive work on every keystroke.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
