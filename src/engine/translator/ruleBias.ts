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
    const out: Record<string, number> = { ...DEFAULT_RULE_BIAS };
    for (const [key, v] of Object.entries(obj)) {
      if (!LOWER_FAMILY.has(key.toLowerCase())) continue;
      const num = Number(v);
      if (!Number.isFinite(num)) continue;
      out[key.toLowerCase()] = Math.max(0.2, Math.min(2.5, num));
    }
    // Shape-check — at least one family must be present.
    const anyFamily = FAMILIES.some((f) => out[f] !== undefined);
    if (!anyFamily) return null;
    return out as BiasVector;
  } catch {
    return null;
  }
}
