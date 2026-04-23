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
 * Ask Ministral for a rule-bias vector matching the user's stylistic intent
 * (e.g. "make this language sound more Germanic"). Returns a merged
 * BiasVector (defaults overridden by the model's suggestions), or null if
 * the response was unparseable.
 */
export async function suggestRuleBias(
  intent: string,
): Promise<{ bias: BiasVector; raw: string } | null> {
  const { chatOnce } = await import("../semantics/llm");

  const prompt = `You are tuning a procedural sound-change generator. Each "family" influences which types of sound laws the language will invent.

Families and what they do:
- lenition: weakening (stop→fricative, intervocalic voicing)
- fortition: strengthening (final devoicing, voicing assimilation)
- place_assim: place assimilation (nasal place, coronal retraction)
- palatalization: palatalisation before front vowels
- vowel_shift: wholesale vowel raising/lowering/rounding
- vowel_reduction: unstressed → schwa, deletion
- harmony: vowel harmony / umlaut
- deletion: segment drops (final C, h-loss)
- metathesis: adjacent-segment swaps
- tone: pitch contrasts

Given the user's stylistic intent, return a JSON object mapping each family to a multiplier in [0.2, 2.5]. 1.0 = default. Unmentioned families should be 1.0.

User intent: "${intent}"

Respond with ONLY this JSON (one line, no prose):
{"lenition":1.0,"fortition":1.0,"place_assim":1.0,"palatalization":1.0,"vowel_shift":1.0,"vowel_reduction":1.0,"harmony":1.0,"deletion":1.0,"metathesis":1.0,"tone":1.0}`;

  const raw = await chatOnce(prompt, { maxTokens: 160, temperature: 0.3 });
  const parsed = parseBias(raw);
  if (!parsed) return null;
  return { bias: parsed, raw };
}

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
