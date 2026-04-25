import type { LanguageTree } from "../types";

/**
 * Sorted list of leaf-language ids in a `LanguageTree`. Lives in its own
 * module so callers (territory, tier, split) can share it without
 * creating an import cycle through `tree/split.ts`.
 */
export function leafIds(tree: LanguageTree): string[] {
  return Object.keys(tree)
    .filter((id) => tree[id]!.childrenIds.length === 0)
    .sort();
}
