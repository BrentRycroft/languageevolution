import type { Language, WordForm } from "../types";
import { syllabify as sonoritySyllabify } from "./syllable";

const LAXING: Record<string, string> = {
  o: "ɔ",
  u: "ʊ",
  e: "ɛ",
  i: "ɪ",
};

function laxen(p: string): string {
  let base = p;
  let suffix = "";
  while (base.length > 1 && /[ːˈˌ˥˧˩]/.test(base.slice(-1))) {
    suffix = base.slice(-1) + suffix;
    base = base.slice(0, -1);
  }
  const lax = LAXING[base];
  return (lax ?? base) + suffix;
}

interface Syllable {
  onset: string[];
  nucleus: string[];
  coda: string[];
}

function syllabify(form: WordForm): Syllable[] {
  const sylls = sonoritySyllabify(form);
  if (sylls.length === 0) {
    return form.length > 0
      ? [{ onset: [], nucleus: form.slice(), coda: [] }]
      : [];
  }
  return sylls.map((s) => ({
    onset: s.onset.map((i) => form[i]!),
    nucleus: [form[s.nucleus]!],
    coda: s.coda.map((i) => form[i]!),
  }));
}

function renderSyllable(s: Syllable, laxVowels: boolean): string {
  const nucleus = s.nucleus.map((p) => (laxVowels ? laxen(p) : p)).join("");
  return s.onset.join("") + nucleus + s.coda.join("");
}

export function narrowTranscribe(
  form: WordForm,
  lang?: Language,
  meaning?: string,
): string {
  if (form.length === 0) return "";
  const sylls = syllabify(form);
  if (sylls.length === 0) return form.join("");
  const pattern = lang?.stressPattern ?? "penult";
  const lexicalIdx = pattern === "lexical" && meaning && lang?.lexicalStress
    ? lang.lexicalStress[meaning]
    : undefined;
  let stressedIdx: number;
  if (sylls.length <= 1) {
    stressedIdx = 0;
  } else if (pattern === "initial") {
    stressedIdx = 0;
  } else if (pattern === "final") {
    stressedIdx = sylls.length - 1;
  } else if (pattern === "antepenult") {
    stressedIdx = Math.max(0, sylls.length - 3);
  } else if (pattern === "lexical" && lexicalIdx !== undefined && lexicalIdx >= 0 && lexicalIdx < sylls.length) {
    stressedIdx = lexicalIdx;
  } else {
    stressedIdx = sylls.length - 2;
  }
  const parts = sylls.map((s, i) => {
    const body = renderSyllable(s, true);
    return (i === stressedIdx && sylls.length > 1 ? "ˈ" : "") + body;
  });
  return parts.join(".");
}
