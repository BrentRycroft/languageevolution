/**
 * vec.ts — fixed-point vector substrate for the vector-space-native meaning model.
 *
 * A meaning/morpheme position is an Int32Array of VEC_DIM components, each = round(value
 * × VEC_SCALE). Integer storage + integer arithmetic make every distance and ranking
 * decision byte-identical across platforms (the project's determinism invariant). Int32
 * (not Int16) gives composition headroom so sums of several morpheme vectors never
 * overflow. The first LEXICAL_DIMS dims mirror the shipped GloVe-50 space; the trailing
 * GRAMMATICAL_DIMS are reserved (zero-filled) for Track E and unused until then.
 */

export const VEC_SCALE = 4096; // 2^12 fixed-point scale
export const LEXICAL_DIMS = 50; // GloVe-50
export const GRAMMATICAL_DIMS = 8; // reserved for Track E
export const VEC_DIM = LEXICAL_DIMS + GRAMMATICAL_DIMS; // 58

export type Vec = Int32Array;

/** A zero vector of the full dimensionality. */
export function zeroVec(): Vec {
  return new Int32Array(VEC_DIM);
}

/** Quantize float components into the lexical dims (grammatical dims stay zero). */
export function fromFloats(floats: readonly number[]): Vec {
  const v = new Int32Array(VEC_DIM);
  const n = Math.min(floats.length, VEC_DIM);
  for (let i = 0; i < n; i++) v[i] = Math.round(floats[i]! * VEC_SCALE);
  return v;
}

/** Dequantize to floats (display / interop only — never for ranking decisions). */
export function toFloats(v: Vec): number[] {
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i]! / VEC_SCALE;
  return out;
}

/** Componentwise sum (additive composition). Integer-exact. */
export function sumVecs(vs: readonly Vec[]): Vec {
  const out = new Int32Array(VEC_DIM);
  for (const v of vs) for (let i = 0; i < VEC_DIM; i++) out[i]! += v[i]!;
  return out;
}

/** Integer dot product. Safe in a JS number. */
export function dotFixed(a: Vec, b: Vec): number {
  let d = 0;
  for (let i = 0; i < VEC_DIM; i++) d += a[i]! * b[i]!;
  return d;
}

/** Squared Euclidean distance — integer-exact. USE THIS for all ranking/argmax. */
export function distanceSq(a: Vec, b: Vec): number {
  let s = 0;
  for (let i = 0; i < VEC_DIM; i++) {
    const diff = a[i]! - b[i]!;
    s += diff * diff;
  }
  return s;
}

/** Cosine similarity. Float output — for human-readable readout ONLY, never ranking. */
export function cosineFixed(a: Vec, b: Vec): number {
  const dot = dotFixed(a, b);
  const na = Math.sqrt(dotFixed(a, a));
  const nb = Math.sqrt(dotFixed(b, b));
  if (na === 0 || nb === 0) return 0;
  return dot / (na * nb);
}
