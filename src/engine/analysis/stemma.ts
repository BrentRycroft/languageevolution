import type { Language, LanguageTree } from "../types";
import { leafIds } from "../tree/split";

export function ruleDistance(a: Language, b: Language): number {
  const aTemplates = new Set((a.activeRules ?? []).map((r) => r.templateId));
  const bTemplates = new Set((b.activeRules ?? []).map((r) => r.templateId));
  if (aTemplates.size === 0 && bTemplates.size === 0) return 0;
  let intersection = 0;
  for (const t of aTemplates) if (bTemplates.has(t)) intersection++;
  const union = aTemplates.size + bTemplates.size - intersection;
  if (union === 0) return 0;
  return 1 - intersection / union;
}

export interface StemmaEdge {
  a: string;
  b: string;
  distance: number;
}

export function stemmaMatrix(tree: LanguageTree): StemmaEdge[] {
  const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
  const edges: StemmaEdge[] = [];
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = tree[leaves[i]!]!.language;
      const b = tree[leaves[j]!]!.language;
      edges.push({ a: leaves[i]!, b: leaves[j]!, distance: ruleDistance(a, b) });
    }
  }
  edges.sort((x, y) => x.distance - y.distance);
  return edges;
}

export interface StemmaNode {
  id: string;
  name: string;
  children: StemmaNode[];
  distance: number;
}

export function buildStemma(tree: LanguageTree): StemmaNode | null {
  const leaves = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
  if (leaves.length === 0) return null;
  if (leaves.length === 1) {
    return {
      id: leaves[0]!,
      name: tree[leaves[0]!]!.language.name,
      children: [],
      distance: 0,
    };
  }

  interface Cluster {
    id: string;
    members: string[];
    node: StemmaNode;
  }

  const clusters: Cluster[] = leaves.map((id) => ({
    id,
    members: [id],
    node: {
      id,
      name: tree[id]!.language.name,
      children: [],
      distance: 0,
    },
  }));

  const dist = new Map<string, number>();
  const key = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      const a = tree[leaves[i]!]!.language;
      const b = tree[leaves[j]!]!.language;
      dist.set(key(leaves[i]!, leaves[j]!), ruleDistance(a, b));
    }
  }

  const pairDistance = (u: Cluster, v: Cluster): number => {
    let best = Infinity;
    for (const x of u.members) {
      for (const y of v.members) {
        const d = dist.get(key(x, y)) ?? 1;
        if (d < best) best = d;
      }
    }
    return best;
  };

  while (clusters.length > 1) {
    let bestI = 0;
    let bestJ = 1;
    let bestD = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const d = pairDistance(clusters[i]!, clusters[j]!);
        if (d < bestD) {
          bestD = d;
          bestI = i;
          bestJ = j;
        }
      }
    }
    const u = clusters[bestI]!;
    const v = clusters[bestJ]!;
    const merged: Cluster = {
      id: `${u.id}+${v.id}`,
      members: [...u.members, ...v.members],
      node: {
        id: `${u.id}+${v.id}`,
        name: "",
        children: [u.node, v.node],
        distance: bestD,
      },
    };
    clusters.splice(bestJ, 1);
    clusters.splice(bestI, 1);
    clusters.push(merged);
  }

  return clusters[0]!.node;
}
