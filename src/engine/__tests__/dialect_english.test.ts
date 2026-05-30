import { describe, it, expect } from "vitest";
import { tokenise, tokeniseEnglish } from "../translator/sentence";
import { ENGLISH_DIALECT } from "../translator/dialects/english";

/**
 * Phase 73c Tier C Phase 5.5 — `SourceDialect` extraction.
 *
 * The English-specific morphology tables (irregular verbs +
 * plurals, past participles, auxiliaries, contraction hosts,
 * strip-suffix helpers) live in `translator/dialects/english.ts`
 * as `ENGLISH_DIALECT`. The legacy `tokeniseEnglish(text)` is now
 * a thin wrapper around `tokenise(text, ENGLISH_DIALECT)`.
 *
 * Phase 5.5 contract: byte-identical tokenizer output between the
 * new `tokenise` entry point and the legacy `tokeniseEnglish`
 * shim across the simulator's canonical input corpus.
 */

const CORPUS = [
  // Canonical narrative inputs (mirrors narrative_snapshot test).
  "the king sees the wolf",
  "the dogs see the wolves",
  "i give you the bread",
  "the king walks at the river",
  "the king does not see the wolf",
  // Irregular verbs + plurals.
  "the men eat the geese",
  "the children took the mice",
  "she went and saw the wolves",
  // Contractions.
  "the king doesn't see the wolf",
  "she couldn't sleep",
  "they won't come",
  // Past participles + perfect aspect.
  "the king has seen the wolf",
  "the queen had gone home",
  // Relative clauses + coord.
  "the king who saw the wolf walks",
  "the queen and the king sleep",
  // Imperatives + WH-subjects.
  "see the wolf",
  "who sees the wolf",
  "what does the king see",
];

describe("Phase 73c Phase 5.5 — tokenise(text, ENGLISH_DIALECT) byte-identity", () => {
  it.each(CORPUS)("matches tokeniseEnglish for: %s", (input) => {
    const viaDialect = tokenise(input, ENGLISH_DIALECT);
    const viaLegacy = tokeniseEnglish(input);
    expect(viaDialect).toHaveLength(viaLegacy.length);
    for (let i = 0; i < viaLegacy.length; i++) {
      expect(viaDialect[i]).toEqual(viaLegacy[i]);
    }
  });

  it("tokenise without args defaults to ENGLISH_DIALECT", () => {
    const explicit = tokenise("the king sees the wolf", ENGLISH_DIALECT);
    const defaulted = tokenise("the king sees the wolf");
    expect(defaulted).toEqual(explicit);
  });
});

describe("Phase 73c Phase 5.5 — ENGLISH_DIALECT shape", () => {
  it("exposes all the legacy tokenizer tables", () => {
    expect(ENGLISH_DIALECT.irregularVerbs["went"]).toBe("go");
    expect(ENGLISH_DIALECT.irregularPlurals["geese"]).toBe("goose");
    expect(ENGLISH_DIALECT.pastParticiples.has("seen")).toBe(true);
    expect(ENGLISH_DIALECT.auxVerbs.has("will")).toBe(true);
    expect(ENGLISH_DIALECT.contractionHosts["doesn"]).toBe("does");
  });

  it("stripVerbSuffix handles English regular and irregular forms", () => {
    expect(ENGLISH_DIALECT.stripVerbSuffix("walking")).toBe("walk");
    expect(ENGLISH_DIALECT.stripVerbSuffix("walked")).toBe("walk");
    expect(ENGLISH_DIALECT.stripVerbSuffix("walks")).toBe("walk");
    expect(ENGLISH_DIALECT.stripVerbSuffix("went")).toBe("go");
    expect(ENGLISH_DIALECT.stripVerbSuffix("sees")).toBe("see");
    expect(ENGLISH_DIALECT.stripVerbSuffix("studies")).toBe("study");
  });

  it("stripNounSuffix handles English regular and irregular plurals", () => {
    expect(ENGLISH_DIALECT.stripNounSuffix("dogs")).toBe("dog");
    expect(ENGLISH_DIALECT.stripNounSuffix("wolves")).toBe("wolf");
    expect(ENGLISH_DIALECT.stripNounSuffix("countries")).toBe("country");
    expect(ENGLISH_DIALECT.stripNounSuffix("men")).toBe("man");
    expect(ENGLISH_DIALECT.stripNounSuffix("geese")).toBe("goose");
  });

  it("Phase 75: high-frequency action verbs tag V with the correct lemma", () => {
    // These verbs were unknown to the wordlist (posOf="other") so they fell
    // through to the default-N fallback and mis-tagged as nouns (e.g. "the man
    // runs and jumps" → "jump" N → S-coordination didn't fire, "and" dropped).
    // Silent-e verbs also need the dialect BARE_VERBS so stripVerbSuffix
    // restores the "e" (dances→dance, not danc).
    const cases: Record<string, string> = {
      jumps: "jump", climbs: "climb", sings: "sing", dances: "dance",
      rides: "ride", drives: "drive", kicks: "kick", draws: "draw",
    };
    for (const [surface, lemma] of Object.entries(cases)) {
      const tok = tokeniseEnglish(`the man ${surface}`)[2]!;
      expect(tok.tag, `${surface} tags as V`).toBe("V");
      expect(tok.lemma, `${surface} lemmatizes to ${lemma}`).toBe(lemma);
    }
  });

  it("Phase 76: verb-dominant intransitives tag V (bleed/heal/kneel/wander…)", () => {
    // More posOf="other" activity verbs that mis-tagged N in verb position,
    // breaking clause/coordination structure. Only OVERWHELMINGLY verb-dominant
    // words (essentially never nouns) were added, since the tokenizer is purely
    // lexical (a bare verb also reads V in noun slots).
    const verbs = ["bleed", "heal", "mend", "bury", "seek", "kneel", "fill", "wander", "crouch", "chew", "pray"];
    for (const v of verbs) {
      const tok = tokeniseEnglish(`the man ${v}s the dog`)[2]!;
      expect(tok.tag, `${v} tags as V`).toBe("V");
      expect(tok.lemma, `${v} lemmatizes to itself`).toBe(v);
    }
    // The verb mis-tag broke S-coordination (verbCount=1 → "and" dropped).
    const toks = tokeniseEnglish("the wolf bleeds and dies");
    expect(toks.map((t) => `${t.lemma}/${t.tag}`).join(" ")).toBe("the/DET wolf/N bleed/V and/CONJ die/V");
  });

  it("Phase 75: quantificational determiners tag DET (many/few/much/several/both)", () => {
    // These pattern prenominally like all/some/every; previously absent from
    // DETERMINERS so they mis-tagged as nouns and the quantifier was dropped
    // ("many men" → "man").
    for (const q of ["many", "few", "much", "several", "both"]) {
      const tok = tokeniseEnglish(`${q} men run`)[0]!;
      expect(tok.tag, `"${q}" tags as DET`).toBe("DET");
    }
  });

  it("Phase 75: an intensifier before an adjective is absorbed (degree=intensive), else parses normally", () => {
    // very/extremely/really/truly/so/too/quite raise a FOLLOWING adjective to
    // degree=intensive and are dropped as tokens; but only before an adjective —
    // "so the dog runs" keeps "so" as a conjunction (look-ahead guard).
    for (const intq of ["very", "extremely", "really", "truly", "so", "too", "quite"]) {
      const toks = tokeniseEnglish(`the ${intq} big dog runs`);
      expect(toks.some((t) => t.lemma === intq), `"${intq}" is absorbed, not a stray token`).toBe(false);
      const adj = toks.find((t) => t.tag === "ADJ" && t.lemma === "big");
      expect(adj?.features.degree, `adjective after "${intq}" is intensive`).toBe("intensive");
    }
    // Not before an adjective → unchanged.
    const conj = tokeniseEnglish("so the dog runs");
    expect(conj.some((t) => t.lemma === "so" && t.tag === "CONJ"), "'so' before a non-adjective stays a conjunction").toBe(true);
  });

  it("Phase 75: periphrastic 'more'/'most' + adjective set comparative/superlative degree", () => {
    // "more big" → comparative, "most big" → superlative (the degree word is
    // absorbed); "more dogs" keeps "more" (quantifier) via the look-ahead guard.
    const more = tokeniseEnglish("the man is more big");
    const cmp = more.find((t) => t.tag === "ADJ" && t.lemma === "big");
    expect(cmp?.features.degree, "'more big' → comparative").toBe("comparative");
    expect(more.some((t) => t.lemma === "more"), "'more' absorbed before an adjective").toBe(false);

    const most = tokeniseEnglish("the man is most big");
    expect(most.find((t) => t.tag === "ADJ" && t.lemma === "big")?.features.degree, "'most big' → superlative").toBe("superlative");

    const quant = tokeniseEnglish("the man sees more dogs");
    expect(quant.some((t) => t.lemma === "more"), "'more dogs' keeps 'more' (quantifier)").toBe(true);
  });

  it("Phase 76: deictic locative/temporal adverbs tag ADV (here/there/yesterday/now)", () => {
    // The wordlist mis-classifies these (here/there="pronoun", yesterday="other"),
    // so they hit the default-N fallback and were dropped/mis-collected. They must
    // tag ADV so collectMannerParticipants keeps them as adjuncts.
    for (const a of ["here", "there", "yesterday", "today", "now", "then"]) {
      const tok = tokeniseEnglish(`the man runs ${a}`).find((t) => t.lemma === a);
      expect(tok?.tag, `"${a}" tags ADV`).toBe("ADV");
    }
  });

  it("Phase 76: 'her' is a possessive determiner before a noun, object pronoun elsewhere", () => {
    // "her" is both the possessive determiner ("her dog") and the object pronoun
    // ("see her"); the pronoun branch used to always win, dropping the possessive.
    const poss = tokeniseEnglish("her dog runs")[0]!;
    expect(poss.tag, "'her dog' → DET").toBe("DET");
    expect(poss.lemma, "possessive lemma stays 'her'").toBe("her");
    const possAdj = tokeniseEnglish("her big dog runs")[0]!;
    expect(possAdj.tag, "'her big dog' → DET").toBe("DET");
    // Object pronoun: followed by nothing, a conjunction, or a determiner (dative).
    expect(tokeniseEnglish("the man sees her")[3]!.tag, "'sees her' → PRON").toBe("PRON");
    expect(tokeniseEnglish("the man gives her the stone")[3]!.tag, "dative 'her the stone' → PRON").toBe("PRON");
  });
});
