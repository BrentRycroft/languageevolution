import type { LanguageTree } from "../types";

/**
 * leafIds.ts
 *
 * Phylogenetic split mechanics, leafIds, founder selection, MSA-based proto reconstruction. Key exports: leafIds.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const LEAF_CACHE = new WeakMap<LanguageTree, { size: number; ids: string[] }>();

export function leafIds(tree: LanguageTree): string[] {
  const treeKeys = Object.keys(tree);
  const cached = LEAF_CACHE.get(tree);
  if (cached && cached.size === treeKeys.length) return cached.ids;
  const ids = treeKeys
    .filter((id) => tree[id]!.childrenIds.length === 0)
    .sort();
  LEAF_CACHE.set(tree, { size: treeKeys.length, ids });
  return ids;
}
