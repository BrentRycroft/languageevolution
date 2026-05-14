/**
 * dialects/types.ts — Phase 73c Tier C Phase 5.5.
 *
 * `SourceDialect` is the per-language descriptor the tokenizer
 * + parser consume to find lemmas, strip morphological inflections,
 * resolve contractions, and identify auxiliaries. Pre-5.5 these
 * tables lived inline in `translator/sentence.ts` and were
 * hardcoded English; with the descriptor a future seed pathway
 * (IPA, Spanish, Toki Pona) can supply its own
 * `SourceDialect` and reuse the same tokenizer + parser shape.
 *
 * Scope note: Phase 5.5 ships only the extraction. The legacy
 * `tokeniseEnglish` shim preserves the signature and defaults to
 * `ENGLISH_DIALECT`, so existing callers see no behavioural
 * change. Adding non-English dialects is a future extension.
 *
 * The dialect doesn't cover EVERY English-specific token-tagging
 * heuristic — sentence.ts retains general infrastructure like
 * BARE_NOUNS / BARE_VERBS / BARE_ADJECTIVES sets that act as
 * lexical hints across the parser. Phase 6+ can decide whether
 * those belong on the dialect descriptor too.
 */

export interface SourceDialect {
  /**
   * Surface form → lemma map for irregular verbs. Looked up before
   * any suffix-stripping rule fires. English: went → go, saw → see,
   * etc. Empty record disables the lookup.
   */
  irregularVerbs: Readonly<Record<string, string>>;
  /**
   * Surface form → singular map for irregular plurals. English:
   * men → man, geese → goose. Used in `stripNounSuffix`.
   */
  irregularPlurals: Readonly<Record<string, string>>;
  /**
   * Past participle surface forms (seen, gone, taken, …). Used
   * by the parser to detect aspect/voice from auxiliary + past-
   * participle pairings.
   */
  pastParticiples: ReadonlySet<string>;
  /**
   * Auxiliary verb surface forms. English: is, are, was, were, be,
   * have, has, had, do, does, did, will, would, shall, should, can,
   * could, may, might, must. The tokenizer tags these as AUX rather
   * than V; the parser promotes one to V if no main verb exists.
   */
  auxVerbs: ReadonlySet<string>;
  /**
   * Contraction host map: when a word ends a contraction like
   * "doesn't" → ["doesn", "t"], the host token "doesn" maps back
   * to its full form "does". English: doesn → does, won → will,
   * couldn → could, etc.
   */
  contractionHosts: Readonly<Record<string, string>>;
  /**
   * Strip a verb's inflectional suffix to recover its lemma.
   * English: walked → walk, walking → walk, walks → walk.
   * Falls back to identity for forms with no matching rule.
   */
  stripVerbSuffix(s: string): string;
  /**
   * Strip a noun's plural suffix to recover its singular.
   * English: dogs → dog, wolves → wolf, knives → knife.
   * Falls back to identity for forms with no matching rule.
   */
  stripNounSuffix(s: string): string;
}
