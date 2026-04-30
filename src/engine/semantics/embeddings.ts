import type { Meaning } from "../types";
import { clusterOf } from "./clusters";
import { complexityFor } from "../lexicon/complexity";
import {
  CONCEPTS,
  CONCEPT_IDS,
  colexWith,
  isRegisteredConcept,
} from "../lexicon/concepts";
import { fnv1a } from "../rng";

export const EMBEDDING_DIMS = 12;

const CLUSTER_CENTROIDS: Record<string, number[]> = {
  body:        [0.3, 0.85, 1.0,  0.0,  0.1,  0.1, 0.0,  0.0,  0.0,  0.0,  0.0,  0.0],
  kinship:     [1.0, 0.85, 0.0,  0.0,  0.0,  0.0, 0.0,  0.0,  0.3,  0.1,  1.0,  0.0],
  environment: [0.0, 0.85, 0.0,  1.0,  0.1,  0.1, 0.1,  0.5,  0.0,  0.3,  0.0,  0.0],
  animals:     [1.0, 0.9,  0.0,  0.5,  0.4,  0.0, 0.1,  0.4,  0.0,  0.0,  0.1,  0.0],
  plants:      [0.2, 0.85, 0.0,  0.8,  0.0,  0.0, 0.2,  0.4,  0.1,  0.2,  0.0,  0.0],
  food:        [0.0, 0.7,  0.0,  0.2,  0.1,  0.1, 1.0,  0.2,  0.3,  0.0,  0.0,  0.0],
  clothing:    [0.0, 0.8,  0.2,  0.0,  0.1,  0.0, 0.0,  0.2,  0.1,  0.0,  0.0,  0.0],
  tools:       [0.0, 0.85, 0.0,  0.0,  0.3,  0.0, 0.0,  0.3,  0.1,  0.0,  0.0,  0.0],
  motion:      [0.0, 0.2,  0.0,  0.0,  1.0,  0.0, 0.0,  0.0,  0.0,  0.1,  0.0,  0.0],
  perception:  [0.0, 0.2,  0.0,  0.0,  0.1,  1.0, 0.0,  0.0,  0.1,  0.0,  0.0,  0.0],
  metabolism:  [0.0, 0.3,  0.1,  0.0,  0.2,  0.0, 1.0,  0.0,  0.1,  0.1,  0.0,  0.0],
  action:      [0.0, 0.3,  0.0,  0.0,  0.7,  0.1, 0.1,  0.0,  0.0,  0.0,  0.0,  0.0],
  quality:     [0.0, 0.2,  0.0,  0.0,  0.0,  0.2, 0.0,  0.4,  0.4,  0.1,  0.0,  0.1],
  pronoun:     [0.5, 0.2,  0.0,  0.0,  0.0,  0.3, 0.0,  0.0,  0.0,  0.0,  0.4,  0.2],
  numbers:     [0.0, 0.0,  0.0,  0.0,  0.0,  0.1, 0.0,  0.2,  0.0,  0.0,  0.0,  1.0],
  spatial:     [0.0, 0.3,  0.0,  0.2,  0.2,  0.2, 0.0,  0.3,  0.0,  0.0,  0.0,  0.0],
  time:        [0.0, 0.1,  0.0,  0.2,  0.0,  0.1, 0.0,  0.0,  0.0,  1.0,  0.0,  0.0],
  abstract:    [0.0, -0.2, 0.0,  0.0,  0.0,  0.4, 0.0,  0.0,  0.2,  0.1,  0.1,  0.0],
};

const ANCHOR_OVERRIDES: Record<Meaning, number[]> = {
  water:  [0.0, 0.9, 0.0, 1.0, 0.2, 0.0, 0.4, 0.4, 0.0, 0.0, 0.0, 0.0],
  fire:   [0.0, 0.9, 0.0, 1.0, 0.3, 0.0, 0.2, 0.3, 0.1, 0.0, 0.0, 0.0],
  sun:    [0.0, 0.9, 0.0, 1.0, 0.0, 0.1, 0.0, 0.7, 0.3, 0.7, 0.0, 0.0],
  moon:   [0.0, 0.9, 0.0, 1.0, 0.0, 0.1, 0.0, 0.5, 0.1, 0.8, 0.0, 0.0],
  day:    [0.0, 0.4, 0.0, 0.4, 0.0, 0.1, 0.0, 0.0, 0.2, 1.0, 0.0, 0.0],
  night:  [0.0, 0.4, 0.0, 0.5, 0.0, 0.1, 0.0, 0.0, -0.2, 1.0, 0.0, 0.0],
  go:     [0.0, 0.2, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0],
  see:    [0.0, 0.3, 0.0, 0.0, 0.2, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  know:   [0.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.2, 0.0, 0.0, 0.0],
  eat:    [0.0, 0.2, 0.0, 0.0, 0.3, 0.0, 1.0, 0.0, 0.1, 0.0, 0.0, 0.0],
  drink:  [0.0, 0.3, 0.0, 0.2, 0.3, 0.0, 1.0, 0.0, 0.1, 0.0, 0.0, 0.0],
  sleep:  [0.0, 0.1, 0.0, 0.0, 0.1, 0.0, 0.5, 0.0, 0.1, 0.8, 0.0, 0.0],
  die:    [0.0, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, -0.5, 0.3, 0.0, 0.0],
  big:    [0.0, 0.2, 0.0, 0.0, 0.0, 0.1, 0.0, 1.0, 0.1, 0.0, 0.0, 0.2],
  small:  [0.0, 0.2, 0.0, 0.0, 0.0, 0.1, 0.0, -0.8, -0.1, 0.0, 0.0, 0.2],
  good:   [0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
  bad:    [0.0, 0.0, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0, -1.0, 0.0, 0.0, 0.0],
  hand:   [0.4, 0.9, 1.0, 0.0, 0.2, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  arm:    [0.4, 0.9, 1.0, 0.0, 0.2, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0],
  foot:   [0.4, 0.9, 1.0, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  leg:    [0.4, 0.9, 1.0, 0.0, 0.3, 0.0, 0.0, 0.1, 0.0, 0.0, 0.0, 0.0],
  mother: [1.0, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.4, 0.0, 1.0, 0.0],
  father: [1.0, 0.9, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.3, 0.0, 1.0, 0.0],
};

function zero(): number[] {
  return new Array(EMBEDDING_DIMS).fill(0);
}

function add(a: number[], b: number[], scale = 1): number[] {
  const out = zero();
  for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = a[i]! + b[i]! * scale;
  return out;
}

function avg(a: number[], b: number[]): number[] {
  const out = zero();
  for (let i = 0; i < EMBEDDING_DIMS; i++) out[i] = (a[i]! + b[i]!) / 2;
  return out;
}

function jitter(id: Meaning, magnitude: number): number[] {
  const out = zero();
  let seed = fnv1a(id);
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    out[i] = ((seed / 0xffffffff) * 2 - 1) * magnitude;
  }
  return out;
}

function applyPosTierModifiers(
  v: number[],
  pos: string,
  tier: number,
): number[] {
  const out = v.slice();
  if (pos === "verb") {
    out[4] += 0.3;
    out[1] -= 0.2;
  }
  if (pos === "adjective") {
    out[8] += 0.2;
    out[7] += 0.15;
    out[1] -= 0.15;
  }
  if (pos === "numeral") {
    out[11] = 1;
    out[1] -= 0.5;
  }
  out[1] -= tier * 0.08;
  return out;
}

function refineByColex(table: Record<Meaning, number[]>): void {
  const seen = new Set<string>();
  for (const id of CONCEPT_IDS) {
    for (const partner of colexWith(id)) {
      const k = id < partner ? `${id}|${partner}` : `${partner}|${id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const a = table[id];
      const b = table[partner];
      if (!a || !b) continue;
      const m = avg(a, b);
      table[id] = add(a, m, 0.3);
      table[partner] = add(b, m, 0.3);
    }
  }
}

function buildBase(): Record<Meaning, number[]> {
  const out: Record<Meaning, number[]> = {};
  for (const id of CONCEPT_IDS) {
    if (ANCHOR_OVERRIDES[id]) {
      out[id] = ANCHOR_OVERRIDES[id]!.slice();
      continue;
    }
    const meta = CONCEPTS[id]!;
    const centroid = CLUSTER_CENTROIDS[meta.cluster] ?? zero();
    let v = centroid.slice();
    v = applyPosTierModifiers(v, meta.pos, meta.tier);
    v = add(v, jitter(id, 0.12));
    out[id] = v;
  }
  refineByColex(out);
  return out;
}

const BASE: Record<Meaning, number[]> = buildBase();

export function embed(meaning: Meaning): number[] {
  if (BASE[meaning]) return BASE[meaning]!.slice();
  if (meaning.includes("-")) {
    const parts = meaning.split("-");
    let v = zero();
    let n = 0;
    for (const p of parts) {
      if (BASE[p]) {
        v = add(v, BASE[p]!);
        n++;
      }
    }
    if (n > 0) {
      for (let i = 0; i < EMBEDDING_DIMS; i++) v[i] = v[i]! / n;
      return v;
    }
  }
  const stripped = meaning.replace(/-(er|ness|ic|al|ine|intens)$/, "");
  if (stripped !== meaning && BASE[stripped]) {
    const v = BASE[stripped]!.slice();
    v[1] -= 0.2;
    return v;
  }
  const v = zero();
  const cluster = clusterOf(meaning);
  if (cluster && CLUSTER_CENTROIDS[cluster]) {
    return add(CLUSTER_CENTROIDS[cluster]!, jitter(meaning, 0.1));
  }
  v[1] -= 0.1 * complexityFor(meaning);
  return v;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < EMBEDDING_DIMS; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function nearestMeanings(
  meaning: Meaning,
  candidates: readonly Meaning[],
  k = 5,
): Meaning[] {
  const target = embed(meaning);
  const scored = candidates
    .filter((c) => c !== meaning)
    .map((c) => ({ c, s: cosine(target, embed(c)) }))
    .filter((x) => x.s > 0.2);
  scored.sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map((x) => x.c);
}

export { isRegisteredConcept };
