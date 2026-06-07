import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { tokeniseEnglish } from "../translator/sentence";
import { parseSyntaxToClause } from "../translator/parse";
import { realiseClause, realiseSingleClause, realiseSentence } from "../translator/realise";
import { sentenceToRoleClause, roleClauseToSentence } from "../translator/ast";
import type { RoleClause } from "../translator/syntax";
import type { Language } from "../types";
import { lexGet } from "../lexicon/access";

/**
 * Phase 73c Tier C Phase 4 — realiser consumes RoleClause.
 *
 * `realiseClause` is the canonical entry point that takes a
 * `RoleClause` and produces `RealisedToken[]`. For Phase 4 it
 * wraps the existing `realiseSentence` body via
 * `roleClauseToSentence`; Phase 6 will narrow to native
 * RoleClause consumption.
 *
 * Tests verify:
 *   - byte-identity with the legacy path (the clause-realisation
 *     wrapper produces identical tokens to direct
 *     `realiseSentence` on the round-tripped Sentence)
 *   - typological correctness: same clause projects differently
 *     under different `lang.grammar.wordOrder` / `alignment`
 *   - coordination chain handling via `realiseClause` vs single-
 *     clause handling via `realiseSingleClause`
 */

function freshLang(seed: string): Language {
  const sim = createSimulation({ ...defaultConfig(), seed });
  return sim.getState().tree[sim.getState().rootId]!.language;
}

function realiseTokens(rc: RoleClause, lang: Language): string[] {
  return realiseSingleClause(rc, lang, {
    resolveOpen: (lemma) => {
      const f = lexGet(lang, lemma);
      return { form: f ?? null, resolution: f ? "direct" : "fallback" };
    },
  }).map((t) => t.role);
}

describe("Phase 73c Phase 4 — realiseClause byte-identity with legacy", () => {
  it("identical output to realiseSentence on round-tripped Sentence", () => {
    const lang = freshLang("p4-byte-id");
    const tokens = tokeniseEnglish("the king sees the wolf");
    const clause = parseSyntaxToClause(tokens)!;
    const sentence = roleClauseToSentence(clause)!;
    const direct = realiseSentence(sentence, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    });
    const viaClause = realiseSingleClause(clause, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    });
    expect(viaClause.length).toBe(direct.length);
    for (let i = 0; i < direct.length; i++) {
      expect(viaClause[i]!.surface).toBe(direct[i]!.surface);
      expect(viaClause[i]!.role).toBe(direct[i]!.role);
    }
  });

  it("byte-identity holds for an intransitive clause", () => {
    const lang = freshLang("p4-intrans");
    const tokens = tokeniseEnglish("the king runs");
    const clause = parseSyntaxToClause(tokens)!;
    const sentence = roleClauseToSentence(clause)!;
    const direct = realiseSentence(sentence, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    }).map((t) => t.surface).join(" ");
    const viaClause = realiseSingleClause(clause, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    }).map((t) => t.surface).join(" ");
    expect(viaClause).toBe(direct);
  });

  it("byte-identity holds for a copular clause with complement", () => {
    const lang = freshLang("p4-copular");
    const tokens = tokeniseEnglish("the king is tall");
    const clause = parseSyntaxToClause(tokens)!;
    const sentence = roleClauseToSentence(clause)!;
    const direct = realiseSentence(sentence, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    }).map((t) => t.surface).join(" ");
    const viaClause = realiseSingleClause(clause, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    }).map((t) => t.surface).join(" ");
    expect(viaClause).toBe(direct);
  });
});

describe("Phase 73c Phase 4 — typological projection", () => {
  it("same RoleClause produces different token order under SVO vs SOV", () => {
    const lang = freshLang("p4-wordorder");
    const tokens = tokeniseEnglish("the king sees the wolf");
    const clause = parseSyntaxToClause(tokens)!;
    // SVO baseline.
    lang.grammar.wordOrder = "SVO";
    const svoRoles = realiseTokens(clause, lang);
    // Flip to SOV and re-realise the SAME clause.
    lang.grammar.wordOrder = "SOV";
    const sovRoles = realiseTokens(clause, lang);
    // The S/V/O roles should appear in different positions.
    const svoVerb = svoRoles.indexOf("V");
    const sovVerb = sovRoles.indexOf("V");
    expect(svoVerb).toBeGreaterThan(-1);
    expect(sovVerb).toBeGreaterThan(-1);
    // In SVO, V is between S and O; in SOV, V is last.
    expect(sovVerb).toBeGreaterThan(svoVerb);
  });

  it("realiseClause walks a coordinatedWith chain", () => {
    const lang = freshLang("p4-coord");
    const tokens = tokeniseEnglish("the king sees the wolf , the queen sees the bear");
    // Build a chain manually from two parses.
    const clause1 = parseSyntaxToClause(tokeniseEnglish("the king sees the wolf"))!;
    const clause2 = parseSyntaxToClause(tokeniseEnglish("the queen sees the bear"))!;
    clause1.coordinatedWith = clause2;
    void tokens;
    const out = realiseClause(clause1, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    });
    // Should produce tokens from BOTH clauses concatenated.
    const verbCount = out.filter((t) => t.role === "V").length;
    expect(verbCount).toBeGreaterThanOrEqual(2);
  });

  it("realiseSingleClause ignores coordinatedWith chain", () => {
    const lang = freshLang("p4-single");
    const clause1 = parseSyntaxToClause(tokeniseEnglish("the king sees the wolf"))!;
    const clause2 = parseSyntaxToClause(tokeniseEnglish("the queen sees the bear"))!;
    clause1.coordinatedWith = clause2;
    const out = realiseSingleClause(clause1, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    });
    // Only clause1's tokens emitted; one verb.
    const verbCount = out.filter((t) => t.role === "V").length;
    expect(verbCount).toBe(1);
  });

  it("sentenceToRoleClause → realiseClause round-trips identical to direct realiseSentence", () => {
    const lang = freshLang("p4-rt");
    const tokens = tokeniseEnglish("the king cuts the bread with a knife");
    const clause = parseSyntaxToClause(tokens)!;
    const sentence = roleClauseToSentence(clause)!;
    const cloneClause = sentenceToRoleClause(sentence);
    const directOut = realiseSentence(sentence, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    }).map((t) => t.surface).join(" ");
    const clauseOut = realiseSingleClause(cloneClause, lang, {
      resolveOpen: (lemma) => {
        const f = lexGet(lang, lemma);
        return { form: f ?? null, resolution: f ? "direct" : "fallback" };
      },
    }).map((t) => t.surface).join(" ");
    expect(clauseOut).toBe(directOut);
  });
});
