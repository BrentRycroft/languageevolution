import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { presetRomance } from "../presets/romance";
import { presetTokipona } from "../presets/tokipona";
import { translateSentence } from "../translator/sentence";
import { leafIds } from "../tree/split";
import type { Language } from "../types";
import type { TranslatedToken } from "../translator/sentence";

/**
 * Phase 73d Phase D0: structural-assertion narrative tests.
 *
 * Pre-D0, this file was a byte-identical-surface snapshot test
 * (`toMatchSnapshot()` on the joined target tokens). Any change
 * to the engine — Tier A's brake loosening, Tier C's IR rework,
 * Tier D's typological-divergence work — would diff the snapshot,
 * making it a chronic regen burden.
 *
 * D0 replaces the snapshot with STRUCTURAL invariants: properties
 * the translator output must satisfy regardless of which specific
 * phonemes a language has drifted to. The invariants catch real
 * regressions (lost tokens, wrong word order, articles emitted in
 * a zero-article language, prepositions emitted in a case-marking
 * language, unresolved-lemma fallback markers in surface output)
 * without trapping the engine in a single allowed surface.
 *
 * Each invariant is checked per (preset × sentence × resulting
 * lang.grammar) tuple. Settings are read off `lang.grammar`, NOT
 * hardcoded per preset, so the test stays correct as presets
 * evolve over generations.
 */

const SENTENCES = [
  "the king sees the wolf",
  "the dogs see the wolves",
  "i give you the bread",
  "the king walks at the river",
  "the king does not see the wolf",
];

interface Probe {
  preset: string;
  sentence: string;
  lang: Language;
  tokens: TranslatedToken[];
  surface: string;
}

function gatherProbes(
  preset: string,
  buildConfig: () => ReturnType<typeof presetEnglish>,
  steps: number,
): Probe[] {
  const sim = createSimulation({ ...buildConfig(), seed: `snap-${preset}` });
  for (let i = 0; i < steps; i++) sim.step();
  const state = sim.getState();
  const leaves = leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  leaves.sort();
  const leafId = leaves[0] ?? state.rootId;
  const lang = state.tree[leafId]!.language;
  return SENTENCES.map((s) => {
    const t = translateSentence(lang, s);
    const surface = t.targetTokens
      .map((tt) => tt.targetSurface ?? "")
      .filter((x) => x.length > 0)
      .join(" ");
    return { preset, sentence: s, lang, tokens: t.targetTokens, surface };
  });
}

function indexOfFirstTag(tokens: TranslatedToken[], tag: TranslatedToken["englishTag"]): number {
  return tokens.findIndex((t) => t.englishTag === tag);
}

function hasFallbackMarker(surface: string): boolean {
  // The realiser wraps unresolved lemmas in « » (or sometimes "
  // — see realise.ts:120 / 134). If they appear in surface, the
  // translator failed to resolve a real word.
  return /[«»“”]/.test(surface);
}

/**
 * For SVO/SOV/etc. word orders, assert the verb's position
 * relative to subject + object nouns matches the language's
 * declared `wordOrder`. Tolerates DET/ADJ/PREP tokens flanking
 * S/V/O — only the relative ORDER of the first V token and the
 * surrounding N/PRON tokens matters.
 */
function assertWordOrderRespected(probe: Probe): void {
  const wo = probe.lang.grammar.wordOrder ?? "SVO";
  const tokens = probe.tokens;
  const vIdx = indexOfFirstTag(tokens, "V");
  if (vIdx < 0) return; // no verb realised — handled by separate assertion
  const nIndices = tokens
    .map((t, i) => ((t.englishTag === "N" || t.englishTag === "PRON") ? i : -1))
    .filter((i) => i >= 0);
  if (nIndices.length < 2) return; // intransitive — relative order undefined
  // For sentences with at least 2 noun-like tokens, the verb's
  // position relative to those tokens should be consistent with
  // wordOrder. Specifically: SOV/OSV → V follows ALL N tokens;
  // VSO/VOS → V precedes ALL N tokens; SVO/OVS → V sits between
  // them.
  const firstN = nIndices[0]!;
  const lastN = nIndices[nIndices.length - 1]!;
  switch (wo) {
    case "SOV":
    case "OSV":
      expect(vIdx, `${probe.preset}/${probe.sentence}: ${wo} → V should follow all N tokens (V@${vIdx}, lastN@${lastN})`).toBeGreaterThan(lastN);
      break;
    case "VSO":
    case "VOS":
      expect(vIdx, `${probe.preset}/${probe.sentence}: ${wo} → V should precede all N tokens (V@${vIdx}, firstN@${firstN})`).toBeLessThan(firstN);
      break;
    case "SVO":
    case "OVS":
      expect(vIdx, `${probe.preset}/${probe.sentence}: ${wo} → V should sit between N tokens (V@${vIdx}, firstN@${firstN}, lastN@${lastN})`).toBeGreaterThan(firstN);
      expect(vIdx, `${probe.preset}/${probe.sentence}: ${wo} → V should sit between N tokens`).toBeLessThan(lastN);
      break;
  }
}

function assertArticlePolicyRespected(probe: Probe): void {
  const ap = probe.lang.grammar.articlePresence ?? "none";
  if (ap !== "none") return;
  // Zero-article language: no DET token should emit "the"/"a"/"an"
  // as a separate token.
  const detTokens = probe.tokens.filter(
    (t) => t.englishTag === "DET" && (t.englishLemma === "the" || t.englishLemma === "a" || t.englishLemma === "an"),
  );
  expect(
    detTokens.length,
    `${probe.preset}/${probe.sentence}: articlePresence="none" but found DET tokens for ${detTokens.map((t) => t.englishLemma).join(",")}`,
  ).toBe(0);
}

function assertCaseStrategyRespected(probe: Probe): void {
  const cs = probe.lang.grammar.caseStrategy ?? "preposition";
  if (cs !== "case") return;
  // Pure case-marking language: no PREP token for input PPs (the
  // case suffix on the noun carries the relation). Postpositions
  // are still legal under `caseStrategy: "postposition"` — not
  // gated here.
  const prepTokens = probe.tokens.filter((t) => t.englishTag === "PREP");
  expect(
    prepTokens.length,
    `${probe.preset}/${probe.sentence}: caseStrategy="case" but found PREP tokens for ${prepTokens.map((t) => t.englishLemma).join(",")}`,
  ).toBe(0);
}

describe("Phase 73d D0 — narrative pipeline structural invariants", () => {
  for (const preset of ["english", "romance", "tokipona"] as const) {
    const buildConfig =
      preset === "english" ? presetEnglish :
      preset === "romance" ? presetRomance :
      presetTokipona;

    describe(`${preset} preset (30 gens)`, () => {
      let probes: Probe[];

      it("populates probe state", () => {
        probes = gatherProbes(preset, buildConfig, 30);
        expect(probes).toHaveLength(SENTENCES.length);
      });

      it("every sentence produces at least one target token", () => {
        for (const p of probes) {
          expect(p.tokens.length, `${preset}/${p.sentence}: zero tokens emitted`).toBeGreaterThan(0);
        }
      });

      it("every sentence's surface contains at least one non-empty word", () => {
        for (const p of probes) {
          expect(p.surface.length, `${preset}/${p.sentence}: empty surface`).toBeGreaterThan(0);
        }
      });

      it("no surface contains unresolved-lemma fallback markers", () => {
        for (const p of probes) {
          expect(
            hasFallbackMarker(p.surface),
            `${preset}/${p.sentence}: surface contains «» fallback markers ("${p.surface}")`,
          ).toBe(false);
        }
      });

      it("every sentence realises a V token", () => {
        for (const p of probes) {
          const hasV = p.tokens.some((t) => t.englishTag === "V");
          expect(hasV, `${preset}/${p.sentence}: no V token in output`).toBe(true);
        }
      });

      it("transitive sentences realise at least 2 N/PRON tokens", () => {
        // 'the king sees the wolf', 'the dogs see the wolves',
        // 'i give you the bread', 'the king does not see the wolf'
        // are all transitive. 'the king walks at the river' is
        // intransitive with a locative PP whose NP also surfaces
        // as N/PRON.
        for (const p of probes) {
          const nounLike = p.tokens.filter(
            (t) => t.englishTag === "N" || t.englishTag === "PRON",
          ).length;
          expect(nounLike, `${preset}/${p.sentence}: expected ≥2 N/PRON tokens, got ${nounLike}`).toBeGreaterThanOrEqual(2);
        }
      });

      it("word order matches lang.grammar.wordOrder", () => {
        for (const p of probes) assertWordOrderRespected(p);
      });

      it("articlePresence='none' produces no DET article tokens", () => {
        for (const p of probes) assertArticlePolicyRespected(p);
      });

      it("caseStrategy='case' produces no PREP tokens", () => {
        for (const p of probes) assertCaseStrategyRespected(p);
      });

      it("negated sentence carries a negation marker", () => {
        const neg = probes.find((p) => p.sentence.includes("does not"));
        if (!neg) return;
        // Negation can surface as a NEG-roled token (`englishTag:
        // "AUX"` with glossNote "negation") or inline with the verb
        // (some languages inflect negation onto the verb). Either
        // counts.
        const hasNegToken = neg.tokens.some(
          (t) => t.englishLemma === "not" || (t.glossNote ?? "").includes("neg"),
        );
        const verbHasNegInflection = neg.tokens.some(
          (t) => t.englishTag === "V" && (t.glossNote ?? "").includes("neg"),
        );
        expect(
          hasNegToken || verbHasNegInflection,
          `${preset}: negated sentence "${neg.sentence}" missing negation signal — surface "${neg.surface}"`,
        ).toBe(true);
      });

      it("at least one input lemma resolves directly from the language's lexicon", () => {
        // Across the 5 sentences, the simulator should resolve
        // SOMETHING via 'direct' resolution (i.e., the language
        // has lexicalised at least one of: king, wolf, dog, see,
        // give, bread, river, walk). If none resolve, the lexicon
        // generation is broken.
        const anyDirect = probes.some((p) =>
          p.tokens.some((t) => t.resolution === "direct"),
        );
        expect(anyDirect, `${preset}: no token across 5 sentences resolved 'direct' — lexicon-gen suspect`).toBe(true);
      });
    });
  }
});
