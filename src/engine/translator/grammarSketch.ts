import type { Language } from "../types";
import { formToString } from "../phonology/ipa";

/**
 * Generate a ~250-word prose grammar sketch using Ministral. Takes the
 * language's grammar features, active-rule templates, a sample of the
 * lexicon, and the register split as context, and returns free-text prose.
 */
export async function generateGrammarSketch(lang: Language): Promise<string> {
  const { chatOnce } = await import("../semantics/llm");

  const sampleLexicon = Object.keys(lang.lexicon)
    .slice(0, 12)
    .map((m) => `${m}=${formToString(lang.lexicon[m]!)}`)
    .join(", ");
  const rules = (lang.activeRules ?? [])
    .slice()
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 6)
    .map((r) => `${r.family} (${r.description})`)
    .join("; ");
  const registerCounts = lang.registerOf
    ? Object.values(lang.registerOf).reduce(
        (acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }),
        {} as Record<string, number>,
      )
    : null;

  const prompt = `You are a linguist writing a short grammar sketch for a constructed language.

Language: ${lang.name}
Word order: ${lang.grammar.wordOrder}
Affix position: ${lang.grammar.affixPosition}
Tense marking: ${lang.grammar.tenseMarking}
Has case: ${lang.grammar.hasCase ? "yes" : "no"}
Gender count: ${lang.grammar.genderCount}
Inventory (${lang.phonemeInventory.segmental.length} segments): ${lang.phonemeInventory.segmental.slice(0, 24).join(" ")}
${lang.phonemeInventory.usesTones ? `Tones: ${lang.phonemeInventory.tones.join(" ")}` : ""}
Active sound laws: ${rules || "(still catalog-driven)"}
Sample lexicon: ${sampleLexicon}
${registerCounts ? `Register split: ${JSON.stringify(registerCounts)}` : ""}

Write a concise 3-paragraph grammar sketch (150–250 words total). Mention the phonological character (inherited from the sound laws), the morphology (inflections where relevant), and the typological profile (word order, alignment). Do NOT invent features that aren't listed. Plain prose, no headings, no markdown.`;

  const raw = await chatOnce(prompt, { maxTokens: 420, temperature: 0.6 });
  return raw.trim();
}
