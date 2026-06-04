import type { Meaning } from "../types";
import { embed, cosine } from "./embeddings";

/**
 * readoutAxes.ts
 *
 * MEGA-overhaul (meaning model = continuous space, HYBRID readout). The semantic
 * embedding is dense and distributional (embeddings.ts). This module is the optional
 * INTERPRETABLE readout layer on top of it: a handful of named axes — valence, size,
 * temperature, brightness, strength, distance — each defined as the (normalised)
 * difference between two pole concepts in the SAME embedding space. Projecting a
 * meaning onto an axis gives a signed scalar (≈ −1 … +1) you can read or use to bias a
 * process (e.g. pejoration along valence).
 *
 * It is purely additive and OFF by default: nothing in the engine consults these axes
 * unless a caller opts in (see `axisBias`), so the system behaves as pure-dense until
 * asked otherwise — which is exactly the "hybrid, can fall back to pure dense" design
 * the project settled on.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

/** Named interpretable axes, each `[positivePole, negativePole]`. */
export const READOUT_AXES: Readonly<Record<string, readonly [Meaning, Meaning]>> = {
  valence: ["good", "bad"],
  size: ["big", "small"],
  temperature: ["hot", "cold"],
  brightness: ["light", "dark"],
  strength: ["strong", "weak"],
  distance: ["far", "near"],
};

export type ReadoutAxis = keyof typeof READOUT_AXES;

function unit(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

const axisVectorCache = new Map<string, number[]>();

/** The (cached) unit direction vector for an axis: embed(pos) − embed(neg), normalised. */
function axisVector(axis: ReadoutAxis): number[] {
  const cached = axisVectorCache.get(axis);
  if (cached) return cached;
  const [pos, neg] = READOUT_AXES[axis];
  const vp = embed(pos);
  const vn = embed(neg);
  const dim = Math.min(vp.length, vn.length);
  const diff = new Array(dim);
  for (let i = 0; i < dim; i++) diff[i] = vp[i]! - vn[i]!;
  const u = unit(diff);
  axisVectorCache.set(axis, u);
  return u;
}

/**
 * Project a meaning onto an axis: a signed scalar where positive leans toward the
 * axis's positive pole (e.g. valence>0 ≈ "good-flavoured"). Returns the cosine between
 * the meaning's embedding and the axis direction, so it is bounded in [−1, 1].
 */
export function projectOnAxis(meaning: Meaning, axis: ReadoutAxis): number {
  return cosine(embed(meaning), axisVector(axis));
}

/** All axis readings for a meaning, keyed by axis name. */
export function readoutProfile(meaning: Meaning): Record<ReadoutAxis, number> {
  const out = {} as Record<ReadoutAxis, number>;
  for (const axis of Object.keys(READOUT_AXES) as ReadoutAxis[]) {
    out[axis] = projectOnAxis(meaning, axis);
  }
  return out;
}

/**
 * Opt-in biasing hook. Returns a multiplier (default 1 = no effect) that a process can
 * apply to nudge behaviour along an axis, ONLY when `enabled`. With `enabled=false`
 * (the default everywhere) this is the identity, preserving pure-dense behaviour.
 *
 * The sign convention: `strength` scales how far the meaning's position on `axis`
 * pushes the multiplier away from 1. A meaning at the positive pole returns
 * `1 + strength`; at the negative pole, `1 − strength`.
 */
export function axisBias(
  meaning: Meaning,
  axis: ReadoutAxis,
  strength: number,
  enabled: boolean,
): number {
  if (!enabled || strength === 0) return 1;
  return 1 + strength * projectOnAxis(meaning, axis);
}
