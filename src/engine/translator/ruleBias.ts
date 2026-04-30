import type { RuleFamily } from "../phonology/generated";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";

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

export function parseBias(raw: string): BiasVector | null {
  const match = raw.match(/\{[\s\S]*?\}/);
  if (!match) return null;
  try {
    const obj = JSON.parse(match[0]) as Record<string, unknown>;
    const out: Record<string, number> = { ...DEFAULT_RULE_BIAS };
    let acceptedKeys = 0;
    for (const [key, v] of Object.entries(obj)) {
      if (!LOWER_FAMILY.has(key.toLowerCase())) continue;
      if (typeof v !== "number" || !Number.isFinite(v)) continue;
      out[key.toLowerCase()] = Math.max(0.2, Math.min(2.5, v));
      acceptedKeys++;
    }
    if (acceptedKeys === 0) return null;
    for (const f of FAMILIES) {
      if (typeof out[f] !== "number") out[f] = DEFAULT_RULE_BIAS[f];
    }
    return out as BiasVector;
  } catch {
    return null;
  }
}
