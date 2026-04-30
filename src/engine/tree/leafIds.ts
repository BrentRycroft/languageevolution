import type { LanguageTree } from "../types";

export function leafIds(tree: LanguageTree): string[] {
  return Object.keys(tree)
    .filter((id) => tree[id]!.childrenIds.length === 0)
    .sort();
}
