import type { Language, Meaning } from "../types";
import type { MorphCategory } from "../morphology/types";
import { closedClassTable } from "./closedClass";
import { disambiguateSense } from "../lexicon/word";

export interface ReverseToken {
  target: string;
  lemma: string | null;
  paradigm?: MorphCategory;
  kind: "open" | "closed" | "missing";
  /**
   * Phase 21b: when the surface form maps to multiple senses (homonymy
   * / polysemy), the disambiguator picks one for `lemma` and lists the
   * remaining candidates here so the UI can show "did you mean…?".
   */
  alternateLemmas?: Meaning[];
}

export interface ReverseTranslation {
  target: string;
  tokens: ReverseToken[];
  english: string;
  missing: string[];
}

interface ReverseLexEntry {
  lemmas: Meaning[]; // Phase 21b: multi-meaning support
  source: "open" | "closed";
}

const cache = new WeakMap<Language, Map<string, ReverseLexEntry>>();

function buildReverseLex(lang: Language): Map<string, ReverseLexEntry> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const map = new Map<string, ReverseLexEntry>();
  const append = (surface: string, lemma: Meaning, source: "open" | "closed"): void => {
    const existing = map.get(surface);
    if (existing) {
      if (!existing.lemmas.includes(lemma)) existing.lemmas.push(lemma);
    } else {
      map.set(surface, { lemmas: [lemma], source });
    }
  };
  // Prefer the form-centric `words` table when present (Phase 21).
  if (lang.words && lang.words.length > 0) {
    for (const w of lang.words) {
      if (!w.formKey) continue;
      for (const s of w.senses) {
        append(w.formKey, s.meaning, "open");
      }
    }
  } else {
    const openLemmas = Object.keys(lang.lexicon).sort();
    for (const lemma of openLemmas) {
      const surface = lang.lexicon[lemma]!.join("");
      if (!surface) continue;
      append(surface, lemma, "open");
    }
  }
  const cct = closedClassTable(lang);
  const closedLemmas = Object.keys(cct).sort();
  for (const lemma of closedLemmas) {
    const surface = cct[lemma]!.join("");
    if (!surface) continue;
    // Closed-class forms are not multi-meaning; only seed if open
    // didn't claim this surface already.
    if (!map.has(surface)) append(surface, lemma, "closed");
  }
  cache.set(lang, map);
  return map;
}

function pickLemma(
  lang: Language,
  entry: ReverseLexEntry,
  contextLemmas: readonly Meaning[],
): Meaning {
  if (entry.lemmas.length === 1) return entry.lemmas[0]!;
  return disambiguateSense(lang, entry.lemmas, { contextLemmas });
}

export function reverseLookupForm(
  lang: Language,
  surface: string,
  contextLemmas: readonly Meaning[] = [],
): ReverseToken {
  if (!surface) return { target: surface, lemma: null, kind: "missing" };
  const quoted = surface.match(/^[“"]([^"”]+)[”"]$/u);
  if (quoted) {
    return { target: surface, lemma: quoted[1]!, kind: "open" };
  }
  const lex = buildReverseLex(lang);
  const direct = lex.get(surface);
  if (direct) {
    const picked = pickLemma(lang, direct, contextLemmas);
    const alternates = direct.lemmas.filter((l) => l !== picked);
    return {
      target: surface,
      lemma: picked,
      kind: direct.source,
      ...(alternates.length > 0 ? { alternateLemmas: alternates } : {}),
    };
  }
  const paradigms = Object.entries(lang.morphology.paradigms).filter(
    ([, p]) => !!p,
  ) as [MorphCategory, NonNullable<typeof lang.morphology.paradigms[MorphCategory]>][];
  paradigms.sort((a, b) => (b[1].affix.length - a[1].affix.length));
  const reportHit = (
    hit: ReverseLexEntry,
    paradigm: MorphCategory,
  ): ReverseToken => {
    const picked = pickLemma(lang, hit, contextLemmas);
    const alternates = hit.lemmas.filter((l) => l !== picked);
    return {
      target: surface,
      lemma: picked,
      paradigm,
      kind: hit.source,
      ...(alternates.length > 0 ? { alternateLemmas: alternates } : {}),
    };
  };
  for (const [cat, p] of paradigms) {
    const affix = p.affix.join("");
    if (!affix) continue;
    if (p.position === "suffix" && surface.endsWith(affix) && surface.length > affix.length) {
      const stem = surface.slice(0, surface.length - affix.length);
      const hit = lex.get(stem);
      if (hit) return reportHit(hit, cat);
    }
    if (p.position === "prefix" && surface.startsWith(affix) && surface.length > affix.length) {
      const stem = surface.slice(affix.length);
      const hit = lex.get(stem);
      if (hit) return reportHit(hit, cat);
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
      if (hit) return reportHit(hit, cat1);
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
      if (hit) return reportHit(hit, catSuf);
    }
  }
  return { target: surface, lemma: null, kind: "missing" };
}

export function reverseTranslate(
  lang: Language,
  target: string,
): ReverseTranslation {
  const targetTokens = target.split(/\s+/).filter((t) => t.length > 0);
  // Two-pass: first do an unambiguous-only pass to gather context, then
  // disambiguate multi-sense forms against that context. Keeps the
  // sentence-level disambiguation deterministic and order-independent.
  const lex = buildReverseLex(lang);
  const contextLemmas: Meaning[] = [];
  for (const t of targetTokens) {
    const hit = lex.get(t);
    if (hit && hit.lemmas.length === 1) contextLemmas.push(hit.lemmas[0]!);
  }
  const tokens: ReverseToken[] = targetTokens.map((t) =>
    reverseLookupForm(lang, t, contextLemmas),
  );
  const english = tokens
    .map((t) => t.lemma ?? `?${t.target}`)
    .join(" ");
  const missing = tokens.filter((t) => t.kind === "missing").map((t) => t.target);
  return { target, tokens, english, missing };
}
