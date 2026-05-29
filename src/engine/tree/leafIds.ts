import type { LanguageTree } from "../types";

/**
 * leafIds.ts
 *
 * Phylogenetic split mechanics, leafIds, founder selection, MSA-based proto reconstruction. Key exports: leafIds.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const LEAF_CACHE = new WeakMap<LanguageTree, { size: number; ids: string[] }>();

// Cache invalidation keys on the total node count. This is sound only
// because the tree is APPEND-ONLY: nodes are added at split and never
// removed, and a node's childrenIds only ever grows (a leaf becomes
// internal once it splits, never the reverse). Any change to the leaf
// SET therefore changes the node count, busting the cache. If a future
// change ever deletes nodes or re-parents them, replace this size check
// with a version counter.
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
