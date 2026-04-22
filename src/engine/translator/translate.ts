import type { Language, WordForm } from "../types";
import { formToString } from "../phonology/ipa";
import { neighborsOf } from "../semantics/neighbors";
import { inflect } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";

export interface TranslationResult {
  form: string;
  phonemes: WordForm;
  source: "exact" | "neighbor" | "compound" | "ai" | "missing";
  notes: string;
}

export function translate(
  lang: Language,
  englishWord: string,
  options: { inflect?: MorphCategory } = {},
): TranslationResult {
  const key = englishWord.trim().toLowerCase();
  if (!key) {
    return { form: "", phonemes: [], source: "missing", notes: "Empty input." };
  }
  if (Object.keys(lang.lexicon).length === 0) {
    return {
      form: "—",
      phonemes: [],
      source: "missing",
      notes: `${lang.name} has no surviving vocabulary.`,
    };
  }

  // 1. exact meaning match
  const exact = lang.lexicon[key];
  if (exact) {
    const inflected =
      options.inflect && lang.morphology.paradigms[options.inflect]
        ? inflect(exact, lang.morphology.paradigms[options.inflect])
        : exact;
    return {
      form: formToString(inflected),
      phonemes: inflected,
      source: "exact",
      notes: `Direct lexicon entry${options.inflect ? ` inflected for ${options.inflect}` : ""}.`,
    };
  }

  // 2. semantic neighbor — either direction.
  //    Forward: neighbors listed for the English word itself.
  for (const n of neighborsOf(key)) {
    const f = lang.lexicon[n];
    if (f) {
      return {
        form: formToString(f),
        phonemes: f,
        source: "neighbor",
        notes: `"${englishWord}" has no direct word; shown as the related term "${n}".`,
      };
    }
  }
  //    Reverse: find a lexicon meaning that considers `key` a neighbor.
  for (const m of Object.keys(lang.lexicon)) {
    if (neighborsOf(m).includes(key)) {
      return {
        form: formToString(lang.lexicon[m]!),
        phonemes: lang.lexicon[m]!,
        source: "neighbor",
        notes: `"${englishWord}" is semantically close to "${m}" in this language.`,
      };
    }
  }

  // 3. existing compound: look for a known compound containing this key
  for (const m of Object.keys(lang.lexicon)) {
    if (m.includes("-")) {
      const parts = m.split("-");
      if (parts.includes(key)) {
        return {
          form: formToString(lang.lexicon[m]!),
          phonemes: lang.lexicon[m]!,
          source: "compound",
          notes: `Coined compound "${m}" contains "${key}".`,
        };
      }
    }
  }

  return {
    form: "—",
    phonemes: [],
    source: "missing",
    notes: `No direct translation; consider enabling AI drift to seed neighbors for "${key}".`,
  };
}

/**
 * Optional LLM-assisted translator. Lazy-imports WebLLM the same way the
 * semantic-drift module does; only called when the user clicks "Try AI".
 */
/**
 * Translate a form from one living language into another by tracing each
 * known meaning. Returns a best-effort form using the target language's
 * existing lexicon, or missing if no matching meaning can be found.
 */
export function translateBetween(
  source: Language,
  target: Language,
  sourceForm: string,
): TranslationResult {
  let matchedMeaning: string | null = null;
  for (const m of Object.keys(source.lexicon)) {
    if (formToString(source.lexicon[m]!) === sourceForm) {
      matchedMeaning = m;
      break;
    }
  }
  if (!matchedMeaning) {
    return {
      form: "—",
      phonemes: [],
      source: "missing",
      notes: `"${sourceForm}" is not a word in ${source.name}.`,
    };
  }
  return translate(target, matchedMeaning);
}

export async function translateWithAI(
  lang: Language,
  englishWord: string,
): Promise<TranslationResult> {
  const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
  const engine = await CreateMLCEngine("gemma-2-2b-it-q4f16_1-MLC");
  const examples = Object.keys(lang.lexicon)
    .slice(0, 10)
    .map((m) => `${m} = ${formToString(lang.lexicon[m]!)}`)
    .join(", ");
  const inventory = lang.phonemeInventory.segmental.slice(0, 30).join(", ");
  const tones = lang.phonemeInventory.usesTones ? lang.phonemeInventory.tones.join("") : "none";

  const prompt = `You are a field linguist working on a fictional language called ${lang.name}.
Phoneme inventory (selection): ${inventory}
Tones: ${tones}
Word order: ${lang.grammar.wordOrder}
Example lexicon: ${examples}

Invent a plausible word in ${lang.name} meaning "${englishWord}". Use only the phonemes listed above. Return the word as an IPA string only, no explanation.`;

  const res = await engine.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    temperature: 0.6,
    max_tokens: 24,
  });
  const raw = (res.choices[0]?.message.content ?? "").trim();
  // Take the first non-empty line, ignoring blank lines.
  const firstLine = raw.split(/\n+/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  // Strip leading/trailing punctuation and quotes; keep IPA diacritics attached.
  const cleaned = firstLine.replace(/^[\s"'`*_.-]+|[\s"'`*_.,;-]+$/g, "");
  const phonemes = Array.from(cleaned);
  return {
    form: cleaned,
    phonemes,
    source: "ai",
    notes: `Invented by the on-device LLM using ${lang.name}'s inventory.`,
  };
}
