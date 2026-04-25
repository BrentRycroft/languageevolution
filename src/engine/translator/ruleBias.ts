import type { RuleFamily } from "../phonology/generated";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";

/**
 * Parsed bias vector output from the LLM. Unknown families are dropped;
 * known families are clamped into [0.15, 3.0].
 */
export type BiasVector = Record<RuleFamily, number>;

const FAMILIES: RuleFamily[] = [
  "lenition",
  "fortition",
  "place_assim",
  "palatalization",
  "vowel_shift",
  "vowel_reduction",
  "harmony",
  "deletion",
  "metathesis",
  "tone",
];

const LOWER_FAMILY = new Set(FAMILIES.map((f) => f.toLowerCase()));

/**
 * Tolerant parser for the bias-vector JSON. Accepts fenced or prose-wrapped
 * output, ignores unknown keys, clamps values, and fills in the defaults
 * for any missing family.
 */
export function parseBias(raw: string): BiasVector | null {
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    // Start from the default vector so every family is guaranteed present
    // in the output; per-family LLM suggestions override.
    const out: Record<string, number> = { ...DEFAULT_RULE_BIAS };
    let acceptedKeys = 0;
    for (const [key, v] of Object.entries(obj)) {
      if (!LOWER_FAMILY.has(key.toLowerCase())) continue;
      // Strict type check: Number(null) === 0, Number(true) === 1, etc.
      // Without this, a malformed LLM output like {"lenition": null}
      // would silently become a 0 (clamped to 0.2) bias multiplier.
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      out[key.toLowerCase()] = Math.max(0.2, Math.min(2.5, v));
      acceptedKeys++;
    }
    // Reject an output that doesn't map any family — a model that returned
    // {} or something full of unknown keys has effectively failed.
    if (acceptedKeys === 0) return null;
    // Shape-check: ensure every canonical family has a value. DEFAULT_RULE_BIAS
    // already covered this, but we re-verify defensively for callers that
    // want to iterate FAMILIES.
    for (const f of FAMILIES) {
      if (typeof out[f] !== "number") out[f] = DEFAULT_RULE_BIAS[f];
    }
    return out as BiasVector;
  } catch {
    return null;
  }
}
