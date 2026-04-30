import type { Language, Meaning } from "../types";
import type { MorphCategory } from "../morphology/types";
import { closedClassTable } from "./closedClass";

export interface ReverseToken {
  target: string;
  lemma: string | null;
  paradigm?: MorphCategory;
  kind: "open" | "closed" | "missing";
}

export interface ReverseTranslation {
  target: string;
  tokens: ReverseToken[];
  english: string;
  missing: string[];
}

interface ReverseLexEntry {
  lemma: Meaning;
  source: "open" | "closed";
}

const cache = new WeakMap<Language, Map<string, ReverseLexEntry>>();

function buildReverseLex(lang: Language): Map<string, ReverseLexEntry> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const map = new Map<string, ReverseLexEntry>();
  const openLemmas = Object.keys(lang.lexicon).sort();
  for (const lemma of openLemmas) {
    const surface = lang.lexicon[lemma]!.join("");
    if (!surface) continue;
    if (!map.has(surface)) {
      map.set(surface, { lemma, source: "open" });
    }
  }
  const cct = closedClassTable(lang);
  const closedLemmas = Object.keys(cct).sort();
  for (const lemma of closedLemmas) {
    const surface = cct[lemma]!.join("");
    if (!surface) continue;
    if (!map.has(surface)) {
      map.set(surface, { lemma, source: "closed" });
    }
  }
  cache.set(lang, map);
  return map;
}

export function reverseLookupForm(
  lang: Language,
  surface: string,
): ReverseToken {
  if (!surface) return { target: surface, lemma: null, kind: "missing" };
  const quoted = surface.match(/^[“"]([^"”]+)[”"]$/u);
  if (quoted) {
    return { target: surface, lemma: quoted[1]!, kind: "open" };
  }
  const lex = buildReverseLex(lang);
  const direct = lex.get(surface);
  if (direct) {
    return { target: surface, lemma: direct.lemma, kind: direct.source };
  }
  const paradigms = Object.entries(lang.morphology.paradigms).filter(
    ([, p]) => !!p,
  ) as [MorphCategory, NonNullable<typeof lang.morphology.paradigms[MorphCategory]>][];
  paradigms.sort((a, b) => (b[1].affix.length - a[1].affix.length));
  for (const [cat, p] of paradigms) {
    const affix = p.affix.join("");
    if (!affix) continue;
    if (p.position === "suffix" && surface.endsWith(affix) && surface.length > affix.length) {
      const stem = surface.slice(0, surface.length - affix.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: cat, kind: hit.source };
    }
    if (p.position === "prefix" && surface.startsWith(affix) && surface.length > affix.length) {
      const stem = surface.slice(affix.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: cat, kind: hit.source };
    }
  }
  for (const [cat1, p1] of paradigms) {
    if (p1.position !== "suffix") continue;
    const a1 = p1.affix.join("");
    if (!a1 || !surface.endsWith(a1) || surface.length <= a1.length) continue;
    const inner = surface.slice(0, surface.length - a1.length);
    for (const [, p2] of paradigms) {
      if (p2.position !== "suffix") continue;
      const a2 = p2.affix.join("");
      if (!a2 || !inner.endsWith(a2) || inner.length <= a2.length) continue;
      const stem = inner.slice(0, inner.length - a2.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: cat1, kind: hit.source };
    }
  }
  for (const [, pPre] of paradigms) {
    if (pPre.position !== "prefix") continue;
    const aPre = pPre.affix.join("");
    if (!aPre || !surface.startsWith(aPre)) continue;
    const afterPre = surface.slice(aPre.length);
    if (!afterPre) continue;
    for (const [catSuf, pSuf] of paradigms) {
      if (pSuf.position !== "suffix") continue;
      const aSuf = pSuf.affix.join("");
      if (!aSuf || !afterPre.endsWith(aSuf) || afterPre.length <= aSuf.length) continue;
      const stem = afterPre.slice(0, afterPre.length - aSuf.length);
      const hit = lex.get(stem);
      if (hit) return { target: surface, lemma: hit.lemma, paradigm: catSuf, kind: hit.source };
    }
  }
  return { target: surface, lemma: null, kind: "missing" };
}

export function reverseTranslate(
  lang: Language,
  target: string,
): ReverseTranslation {
  const targetTokens = target.split(/\s+/).filter((t) => t.length > 0);
  const tokens: ReverseToken[] = targetTokens.map((t) => reverseLookupForm(lang, t));
  const english = tokens
    .map((t) => t.lemma ?? `?${t.target}`)
    .join(" ");
  const missing = tokens.filter((t) => t.kind === "missing").map((t) => t.target);
  return { target, tokens, english, missing };
}
