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
  /**
   * Phase 29-2b: when this entry comes from a SUPPLETIVE form
   * (e.g., target "saw" mapping to meaning "see" with category
   * verb.tense.past), we record the category here so the reverse
   * token can report it without going through the affix-stripping
   * fallback. Pre-29-2b suppletive forms were never added to the
   * reverse lex at all, causing the past-tense translator-roundtrip
   * tests to fail.
   */
  suppletiveParadigm?: MorphCategory;
}

const cache = new WeakMap<Language, Map<string, ReverseLexEntry>>();

function buildReverseLex(lang: Language): Map<string, ReverseLexEntry> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const map = new Map<string, ReverseLexEntry>();
  const append = (
    surface: string,
    lemma: Meaning,
    source: "open" | "closed",
    suppletiveParadigm?: MorphCategory,
  ): void => {
    const existing = map.get(surface);
    if (existing) {
      if (!existing.lemmas.includes(lemma)) existing.lemmas.push(lemma);
      // Don't overwrite a supplative-paradigm tag with a later one;
      // first wins when two paradigms share a surface (rare).
      if (suppletiveParadigm && !existing.suppletiveParadigm) {
        existing.suppletiveParadigm = suppletiveParadigm;
      }
    } else {
      map.set(surface, {
        lemmas: [lemma],
        source,
        ...(suppletiveParadigm ? { suppletiveParadigm } : {}),
      });
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
      // Phase 29-2i: null-guard. The `!` was wrong — `Object.keys`
      // can race with concurrent mutations and a meaning may be
      // mid-deletion when this runs (the engine never deletes during
      // a render but defensive code should not assume).
      const form = lang.lexicon[lemma];
      if (!form) continue;
      const surface = form.join("");
      if (!surface) continue;
      append(surface, lemma, "open");
    }
  }
  // Phase 29-2b: seed every suppletive surface form (e.g., "saw" for
  // meaning "see" + verb.tense.past) BEFORE the affix-stripping
  // fallback. Otherwise the reverse pipeline would try to peel an
  // affix off "saw", fail, and emit `kind: "missing"` for irregular
  // pasts. This is the root cause of the 3 known-failing
  // translator_roundtrip past-tense tests.
  if (lang.suppletion) {
    for (const meaning of Object.keys(lang.suppletion)) {
      const perCategory = lang.suppletion[meaning];
      if (!perCategory) continue;
      for (const cat of Object.keys(perCategory) as MorphCategory[]) {
        const form = perCategory[cat];
        if (!form || form.length === 0) continue;
        const surface = form.join("");
        if (!surface) continue;
        append(surface, meaning, "open", cat);
      }
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
      // Phase 29-2b: forward the suppletive-paradigm tag so callers
      // (translator UI, glossing) know this is e.g. a past-tense form
      // even though we matched it as a direct surface lookup.
      ...(direct.suppletiveParadigm ? { paradigm: direct.suppletiveParadigm } : {}),
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
  // Phase 29 Tranche 2j: 3-affix peel for Romance-style stacked verb
  // forms (root + tense + person + voice). Recursively peels suffixes
  // up to MAX_PEEL_DEPTH layers and reports the outermost matched
  // category. Defensive cap prevents pathological exponential walks.
  const MAX_PEEL_DEPTH = 4;
  const suffixParadigms = paradigms.filter(([, p]) => p.position === "suffix");
  const stack: Array<{ stem: string; outerCat: MorphCategory; depth: number }> = [];
  for (const [cat, p] of suffixParadigms) {
    const affix = p.affix.join("");
    if (!affix || !surface.endsWith(affix) || surface.length <= affix.length) continue;
    stack.push({
      stem: surface.slice(0, surface.length - affix.length),
      outerCat: cat,
      depth: 1,
    });
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur.depth > MAX_PEEL_DEPTH) continue;
    const direct = lex.get(cur.stem);
    if (direct) return reportHit(direct, cur.outerCat);
    if (cur.depth >= MAX_PEEL_DEPTH) continue;
    for (const [, p] of suffixParadigms) {
      const affix = p.affix.join("");
      if (!affix || !cur.stem.endsWith(affix) || cur.stem.length <= affix.length) continue;
      stack.push({
        stem: cur.stem.slice(0, cur.stem.length - affix.length),
        outerCat: cur.outerCat,
        depth: cur.depth + 1,
      });
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
