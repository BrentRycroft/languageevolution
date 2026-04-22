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
  const { chatOnce } = await import("../semantics/llm");
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

  const raw = (await chatOnce(prompt, { maxTokens: 24, temperature: 0.6 })).trim();
  const firstLine = raw.split(/\n+/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  const cleaned = firstLine.replace(/^[\s"'`*_.-]+|[\s"'`*_.,;-]+$/g, "");
  const phonemes = Array.from(cleaned);
  return {
    form: cleaned,
    phonemes,
    source: "ai",
    notes: `Invented by the on-device LLM using ${lang.name}'s inventory.`,
  };
}

export interface SentenceTranslation {
  /** The full target-language sentence (space-separated IPA tokens). */
  target: string;
  /** Per-token (targetForm, englishGloss) pairs for display. */
  tokens: Array<{ form: string; gloss: string }>;
  /** Any English words the dictionary had to paraphrase or drop. */
  missing: string[];
  /** One-line free-text note from the model about grammatical choices. */
  notes: string;
}

/**
 * AI-assisted sentence-level translation from English into the evolved
 * language. The model is given the language's full bilingual dictionary,
 * grammar features, and morphology, then asked to produce a translation
 * respecting word order + case markers. Output is parsed into aligned
 * tokens so the UI can render a gloss row beneath the target sentence.
 */
export async function translateSentenceWithAI(
  lang: Language,
  english: string,
): Promise<SentenceTranslation> {
  const { chatOnce } = await import("../semantics/llm");
  const sentence = english.trim();
  if (!sentence) {
    return { target: "", tokens: [], missing: [], notes: "Empty input." };
  }

  // Build the dictionary dump. Limit to 120 entries so the prompt stays small.
  const entries = Object.keys(lang.lexicon)
    .sort()
    .slice(0, 120)
    .map((m) => `${m}=${formToString(lang.lexicon[m]!)}`)
    .join(" ; ");

  // Morphology hints: list known paradigm keys and their affixes.
  const paradigms = Object.entries(lang.morphology.paradigms)
    .slice(0, 6)
    .map(([cat, p]) => {
      if (!p) return "";
      const affix = p.affix.join("");
      return `${cat}=${p.position === "prefix" ? affix + "-" : "-" + affix}`;
    })
    .filter(Boolean)
    .join(" ; ");

  const registerSummary = lang.registerOf
    ? Object.values(lang.registerOf).reduce(
        (acc, v) => {
          acc[v] = (acc[v] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      )
    : null;

  const prompt = `You are a translator for a fictional evolved language called ${lang.name}.
Word order: ${lang.grammar.wordOrder}. Affix position: ${lang.grammar.affixPosition}.
Tense marking: ${lang.grammar.tenseMarking}. Case: ${lang.grammar.hasCase ? "yes" : "no"}. Gender count: ${lang.grammar.genderCount}.
${paradigms ? `Paradigm hints: ${paradigms}.` : ""}
${registerSummary ? `Register tags: ${JSON.stringify(registerSummary)}.` : ""}

Bilingual dictionary (english=IPA form):
${entries}

Translate the following English sentence into ${lang.name}, using ONLY words from the dictionary above. Preserve the ${lang.grammar.wordOrder} word order. Add inflections where the paradigm hints suggest. If an English word is missing from the dictionary, pick the nearest available word and note it.

English: "${sentence}"

Respond in this exact JSON format (one line, no prose):
{"target":"...","tokens":[{"form":"...","gloss":"..."}],"missing":["..."],"notes":"..."}`;

  const raw = await chatOnce(prompt, { maxTokens: 240, temperature: 0.4 });
  return parseSentenceResponse(raw);
}

/**
 * Defensive parser: the LLM may wrap JSON in a code fence or add prose.
 * Extract the first balanced JSON object and validate shape.
 */
export function parseSentenceResponse(raw: string): SentenceTranslation {
  const fallback: SentenceTranslation = {
    target: "",
    tokens: [],
    missing: [],
    notes: "AI did not return a parseable response.",
  };
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const parsed = JSON.parse(match[0]);
    const target = typeof parsed.target === "string" ? parsed.target : "";
    const tokens = Array.isArray(parsed.tokens)
      ? parsed.tokens
          .filter(
            (t: unknown) =>
              t !== null &&
              typeof t === "object" &&
              typeof (t as { form: unknown }).form === "string",
          )
          .map((t: { form: string; gloss?: string }) => ({
            form: String(t.form),
            gloss: String(t.gloss ?? ""),
          }))
      : [];
    const missing = Array.isArray(parsed.missing)
      ? parsed.missing.map((m: unknown) => String(m))
      : [];
    const notes = typeof parsed.notes === "string" ? parsed.notes : "";
    return { target, tokens, missing, notes };
  } catch {
    return fallback;
  }
}
