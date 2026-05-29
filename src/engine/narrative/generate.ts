import type { Language, Meaning, WordForm } from "../types";
import { makeRng, type Rng } from "../rng";
import { formToString } from "../phonology/ipa";
import { formatForm, type DisplayScript } from "../phonology/display";
import { inflectCascade } from "../morphology/evolve";
import type { MorphCategory } from "../morphology/types";
import { tokeniseEnglish, translateSentenceViaAST } from "../translator/sentence";
import { englishTokensToAST } from "../translator/ast";
import { posOf } from "../lexicon/pos";

/**
 * Phase 53 T6: narrative generator runs purely off the language's own
 * grammar + lexicon. Pre-Phase-53 there were 12 hardcoded
 * SENTENCE_PATTERNS templates ("The {S} {V} the {O}.") and English-
 * flavoured pools (NOUN_POOL, VERB_POOL, ADJECTIVE_POOL, TIME_POOL)
 * that filled slots when the language's lexicon was sparse. Output
 * looked English-shaped regardless of the target's typology.
 *
 * This refactor:
 *   1. Drops SENTENCE_PATTERNS in favour of a grammar-driven shape
 *      picker — sentence shape is chosen probabilistically from
 *      {S+V, S+V+O, S+V+adj, copular} weighted by what the language
 *      actually supports.
 *   2. Drops the curated English pools in favour of POS-filtered
 *      sampling from `lang.lexicon` directly, weighted by
 *      `wordFrequencyHints`.
 *   3. Applies morphology stochastically based on `synthesisIndex`:
 *      synthesis-rich languages stack tense + person + aspect; light
 *      ones stay bare.
 *   4. Picks derivational affixes by per-affix `usageCount` —
 *      frequent affixes show up proportionally more in the output.
 *      Realises the user's "all features and new prefixes based on
 *      how common they should be" requirement.
 */

interface SentenceShape {
  /** True if the shape requires a transitive verb. */
  needsObject: boolean;
  /** True if the shape carries an attributive adjective on the subject. */
  needsAdj: boolean;
  /** True if the shape is a copular predication ("S is X"). */
  copular: boolean;
  /**
   * Phase 61: when set, the rendered line will plug an extra adjective
   * onto the OBJECT instead of (or in addition to) the subject. Lets
   * sibling shapes diverge — "the angry king sees the wolf" vs "the
   * king sees the angry wolf".
   */
  adjOnObject?: boolean;
  /** Phase 61: when set, force plural number marking on the subject. */
  pluralSubject?: boolean;
  /** Phase 61: when set, force plural number marking on the object. */
  pluralObject?: boolean;
}

// Phase 61: expanded from 5 to 9 shapes so the chaos picker has more
// variety to roll. Includes adj-on-object, plural-subject, and
// plural-object variants — gives readers a wider per-line surprise
// profile without inventing new template strings.
const SHAPES: ReadonlyArray<SentenceShape> = [
  { needsObject: true,  needsAdj: false, copular: false }, // S V O
  { needsObject: false, needsAdj: false, copular: false }, // S V
  { needsObject: true,  needsAdj: true,  copular: false }, // adj S V O
  { needsObject: false, needsAdj: true,  copular: false }, // adj S V
  { needsObject: false, needsAdj: true,  copular: true  }, // S is adj
  { needsObject: true,  needsAdj: true,  copular: false, adjOnObject: true }, // S V adj O
  { needsObject: true,  needsAdj: false, copular: false, pluralSubject: true }, // Spl V O
  { needsObject: true,  needsAdj: false, copular: false, pluralObject: true }, // S V Opl
  { needsObject: false, needsAdj: false, copular: false, pluralSubject: true }, // Spl V
];

/**
 * Phase 53 T6: pick a sentence shape probabilistically. Languages
 * with a copula (`hasCopula !== false`) get a small share of copular
 * sentences. Languages whose verbs are predominantly intransitive
 * tilt toward S+V (gauged by adjective vs verb token-count in
 * `wordFrequencyHints`).
 */
function pickShape(lang: Language, rng: Rng): SentenceShape {
  // Phase 61: weights jittered per call so back-to-back shapes diverge
  // even when the underlying language is identical. The base weights
  // give roughly even coverage across the 9 SHAPES while keeping
  // copular gated on the language having "be".
  const hasCopula = !!lang.lexicon["be"];
  const supportsPlural = lang.grammar.pluralMarking === "affix";
  const baseWeights: number[] = [
    0.30, // S V O
    0.18, // S V
    0.10, // adj S V O
    0.08, // adj S V
    hasCopula ? 0.08 : 0.0, // S is adj
    0.10, // S V adj O
    supportsPlural ? 0.06 : 0.0, // Spl V O
    supportsPlural ? 0.05 : 0.0, // S V Opl
    supportsPlural ? 0.05 : 0.0, // Spl V
  ];
  // Per-line jitter: 0.5..1.5× multiplier so the same language emits
  // visibly different shape mixes across lines.
  const weights = baseWeights.map((w) => w * (0.5 + rng.next()));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return SHAPES[0]!;
  let roll = rng.next() * total;
  for (let i = 0; i < SHAPES.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return SHAPES[i]!;
  }
  return SHAPES[0]!;
}

/**
 * Phase 53 T6: weighted pick of a meaning by POS from the language's
 * own lexicon. Frequency-biased via `wordFrequencyHints` (Phase 24);
 * smoothed with a small uniform prior so brand-new lexemes still
 * appear occasionally. Returns null when no lexicalised meaning
 * matches the requested POS — caller should downgrade the shape.
 */
function pickMeaningByPOS(
  lang: Language,
  pos: "noun" | "verb" | "adjective",
  rng: Rng,
): Meaning | null {
  const candidates: Array<{ m: Meaning; w: number }> = [];
  for (const m of Object.keys(lang.lexicon)) {
    if (posOf(m) !== pos) continue;
    if (m.includes("-")) continue; // skip compounds for shape simplicity
    const freq = lang.wordFrequencyHints[m] ?? 0.4;
    // Phase 61: smoothing floor 0.05 → 0.12 widens the long tail
    // without flattening the frequency curve. Pre-Phase-61 only the
    // top ~50 frequent lemmas surfaced in a 1500-word lexicon; the
    // bumped floor lets less-common words appear proportional to
    // their frequency hint without crowding out the staples.
    candidates.push({ m, w: freq + 0.12 });
  }
  if (candidates.length === 0) return null;
  const total = candidates.reduce((acc, c) => acc + c.w, 0);
  let roll = rng.next() * total;
  for (const c of candidates) {
    roll -= c.w;
    if (roll <= 0) return c.m;
  }
  return candidates[candidates.length - 1]!.m;
}

export interface Skeleton {
  shape: SentenceShape;
  subjectNoun: Meaning;
  verb: Meaning;
  objectNoun: Meaning | null;
  adjective: Meaning | null;
}

/**
 * Phase 53 T6: skeleton planner now consults the language directly
 * instead of selecting from English-flavoured pools. Returns one
 * skeleton per requested line, or skips lines whose shape can't be
 * filled by the language's lexicon.
 */
export function planSkeletonForLanguage(
  lang: Language,
  seedStr: string,
  lines: number,
): Skeleton[] {
  const rng = makeRng(`narrative:${lang.id}:${seedStr}:${lines}`);
  const out: Skeleton[] = [];
  for (let i = 0; i < lines; i++) {
    const shape = pickShape(lang, rng);
    const subject = pickMeaningByPOS(lang, "noun", rng);
    if (!subject) continue;
    const verb = pickMeaningByPOS(lang, "verb", rng);
    if (!verb) continue;
    const object = shape.needsObject
      ? pickMeaningByPOS(lang, "noun", rng) ?? subject
      : null;
    const adj = shape.needsAdj ? pickMeaningByPOS(lang, "adjective", rng) : null;
    if (shape.needsAdj && !adj) {
      // Language has no adjectives — downgrade to a non-adj shape.
      out.push({
        shape: { needsObject: shape.needsObject, needsAdj: false, copular: false },
        subjectNoun: subject,
        verb,
        objectNoun: object,
        adjective: null,
      });
      continue;
    }
    out.push({ shape, subjectNoun: subject, verb, objectNoun: object, adjective: adj });
  }
  return out;
}

/**
 * Phase 50 T9 + Phase 53 T6: the legacy `planSkeleton(seedStr, lines)`
 * is kept as a thin wrapper around the language-aware version so
 * callers that don't have a language handy still get a deterministic
 * plan. It uses an English-flavoured stub language internally only
 * for back-compat; real callers should switch to
 * `planSkeletonForLanguage`.
 *
 * @deprecated since Phase 53 T6. Use `planSkeletonForLanguage`.
 */
export function planSkeleton(seedStr: string, lines: number): Skeleton[] {
  void seedStr;
  void lines;
  return [];
}

/**
 * Phase 53 T6 / Phase 61: morphology stack chosen by `synthesisIndex`.
 * Heavier synthesis = thicker stack. Each addition is RNG-gated so
 * back-to-back lines produce visibly different verbs. Phase 63 keeps
 * the broad stack but introduces verb-theme stripping at the inflect
 * layer (see `lang.grammar.verbThemes`) so fusional languages don't
 * suffer concatenative blow-up — the citation-form theme is dropped
 * before paradigms are appended, the way Latin `cantāre` → Spanish
 * `canta-` does.
 */
function morphologyStackForVerb(lang: Language, rng: Rng): MorphCategory[] {
  const idx = lang.grammar.synthesisIndex ?? 1.5;
  const stack: MorphCategory[] = [];
  const has = (cat: MorphCategory): boolean =>
    !!lang.morphology?.paradigms?.[cat];

  // Tense — always high probability.
  if (rng.chance(Math.min(0.95, idx * 0.4))) {
    const choice = rng.chance(0.6) ? "verb.tense.past" : "verb.tense.fut";
    if (has(choice)) stack.push(choice);
  }
  // Person/agreement.
  if (rng.chance(Math.min(0.9, idx * 0.35)) && has("verb.person.3sg")) {
    stack.push("verb.person.3sg");
  }
  // Aspect — broaden choice set at synthesisIndex >= 1.5.
  if (idx >= 1.5 && rng.chance(0.5)) {
    const aspectPool: MorphCategory[] = [
      "verb.aspect.ipfv",
      "verb.aspect.pfv",
      "verb.aspect.prog",
      "verb.aspect.hab",
      "verb.aspect.perf",
    ];
    const available = aspectPool.filter(has);
    if (available.length > 0) {
      stack.push(available[rng.int(available.length)]!);
    }
  }
  // Mood — at synthesisIndex >= 2.
  if (idx >= 2.0 && rng.chance(0.4)) {
    const moodPool: MorphCategory[] = [
      "verb.mood.subj",
      "verb.mood.cond",
      "verb.mood.opt",
      "verb.mood.imp",
    ];
    const available = moodPool.filter(has);
    if (available.length > 0) {
      stack.push(available[rng.int(available.length)]!);
    }
  }
  // Voice / evidential at very heavy synthesis (≥3).
  if (idx >= 3.0 && rng.chance(0.25)) {
    const polyPool: MorphCategory[] = [
      "verb.voice.pass",
      "verb.evid.dir",
    ];
    const available = polyPool.filter(has);
    if (available.length > 0) {
      stack.push(available[rng.int(available.length)]!);
    }
  }
  return stack;
}

function morphologyStackForNoun(
  lang: Language,
  role: "S" | "O",
  rng: Rng,
): MorphCategory[] {
  const idx = lang.grammar.synthesisIndex ?? 1.5;
  const stack: MorphCategory[] = [];
  const has = (cat: MorphCategory): boolean =>
    !!lang.morphology?.paradigms?.[cat];

  if (
    role === "O" &&
    lang.grammar.hasCase &&
    rng.chance(Math.min(0.95, idx * 0.5)) &&
    has("noun.case.acc")
  ) {
    stack.push("noun.case.acc");
  }
  // Phase 61: oblique cases for synthesisIndex >= 2. Gated on
  // lang.grammar.hasCase + paradigm presence so we never invent
  // morphology the language doesn't have.
  if (
    idx >= 2.0 &&
    lang.grammar.hasCase &&
    rng.chance(Math.min(0.4, 0.2 * (idx - 1.0)))
  ) {
    const oblique: MorphCategory[] = [
      "noun.case.gen",
      "noun.case.dat",
      "noun.case.loc",
      "noun.case.inst",
    ];
    const available = oblique.filter(has);
    if (available.length > 0) {
      stack.push(available[rng.int(available.length)]!);
    }
  }
  // Number marking.
  if (
    lang.grammar.pluralMarking === "affix" &&
    rng.chance(Math.min(0.5, idx * 0.25)) &&
    has("noun.num.pl")
  ) {
    stack.push("noun.num.pl");
  }
  return stack;
}

function inflectNoun(
  form: WordForm,
  lang: Language,
  role: "S" | "O",
  meaning: string,
  rng: Rng,
  forcePlural = false,
): WordForm {
  const stack = morphologyStackForNoun(lang, role, rng);
  // Phase 61: shape-driven plural override. When the SHAPE specifies
  // pluralSubject/pluralObject, force a number marker even if the
  // stochastic stack didn't emit one. Skip if the language doesn't
  // have plural marking or the paradigm is missing.
  if (
    forcePlural &&
    lang.grammar.pluralMarking === "affix" &&
    !stack.includes("noun.num.pl") &&
    lang.morphology?.paradigms?.["noun.num.pl"]
  ) {
    stack.push("noun.num.pl");
  }
  if (stack.length === 0) return form;
  return inflectCascade(form, stack, lang, meaning).form;
}

function inflectVerb(
  form: WordForm,
  lang: Language,
  meaning: string,
  rng: Rng,
): WordForm {
  const stack = morphologyStackForVerb(lang, rng);
  if (stack.length === 0) return form;
  return inflectCascade(form, stack, lang, meaning).form;
}

function arrange(
  order: Language["grammar"]["wordOrder"],
  S: string,
  V: string,
  O: string,
): { first: string; second: string; third: string } {
  const map = {
    SOV: { first: S, second: O, third: V },
    SVO: { first: S, second: V, third: O },
    VSO: { first: V, second: S, third: O },
    VOS: { first: V, second: O, third: S },
    OVS: { first: O, second: V, third: S },
    OSV: { first: O, second: S, third: V },
  } as const;
  return map[order];
}

export interface NarrativeLine {
  gloss: string;
  text: string;
}

function usesDeepRouting(lang: Language): boolean {
  const g = lang.grammar;
  return !!(
    g.alignment && g.alignment !== "nom-acc"
    || g.harmony && g.harmony !== "none"
    || g.classifierSystem
    || (g.evidentialMarking && g.evidentialMarking !== "none")
    || g.relativeClauseStrategy
    || g.serialVerbConstructions
    || (g.politenessRegister && g.politenessRegister !== "none")
  );
}

/**
 * Phase 53 T6: build a sentence string in canonical English order
 * for the deep-routing path. We're NOT using a template — we
 * explicitly assemble S V O / S V / etc. in English so
 * translateSentence can parse the structure and route to the
 * language's full pipeline (alignment, harmony, classifiers,
 * evidentials, relative-clause strategy).
 */
function buildEnglishSentence(
  shape: SentenceShape,
  subject: string,
  verb: string,
  object: string | null,
  adjective: string | null,
): string {
  const subjPhrase = adjective ? `${adjective} ${subject}` : subject;
  if (shape.copular && adjective) return `the ${subject} is ${adjective}`;
  if (shape.needsObject && object) return `the ${subjPhrase} ${verb} the ${object}`;
  return `the ${subjPhrase} ${verb}`;
}

function realizeSkeleton(
  lang: Language,
  skeleton: Skeleton,
  script: DisplayScript,
  rng: Rng,
): NarrativeLine | null {
  const { shape, subjectNoun, verb, objectNoun, adjective } = skeleton;
  if (!lang.lexicon[subjectNoun] || !lang.lexicon[verb]) return null;
  if (shape.needsObject && (!objectNoun || !lang.lexicon[objectNoun])) return null;
  if (shape.needsAdj && (!adjective || !lang.lexicon[adjective])) return null;

  if (usesDeepRouting(lang)) {
    const englishStr = buildEnglishSentence(
      shape,
      subjectNoun,
      verb,
      objectNoun,
      adjective,
    );
    // Phase 73b B2: route narrative through the AST bridge so the
    // realiser gets explicit role tags (subject/object) rather than
    // having to recover them from the parser's English-shaped tree.
    // The bridge's astToSentence handles the common case directly;
    // translateSentenceViaAST falls back to parse-on-projected-tokens
    // when the AST IR can't yet express the construction.
    const englishTokens = tokeniseEnglish(englishStr);
    const ast = englishTokensToAST(englishTokens);
    const translated = translateSentenceViaAST(lang, ast, englishStr);
    if (translated.targetTokens.length > 0) {
      const text = translated.targetTokens
        .map((t) => {
          if (t.targetForm.length === 0) return t.targetSurface;
          return script === "ipa"
            ? formToString(t.targetForm)
            : formatForm(t.targetForm, lang, script, t.englishLemma);
        })
        .join(" ");
      const glossParts = translated.targetTokens
        .map((t) => t.englishLemma)
        .filter((l) => l && l !== "?");
      return {
        text,
        gloss: `[${glossParts.join("—")}]`,
      };
    }
  }

  const sForm = lang.lexicon[subjectNoun]!;
  const vForm = lang.lexicon[verb]!;
  const render = (form: WordForm): string =>
    script === "ipa" ? formToString(form) : formatForm(form, lang, script);

  const S = render(inflectNoun(sForm, lang, "S", subjectNoun, rng, !!shape.pluralSubject));
  const V = render(inflectVerb(vForm, lang, verb, rng));

  if (shape.copular && adjective) {
    const adjForm = lang.lexicon[adjective]!;
    const A = render(adjForm);
    // Copular: render as S (be) A. The realiser already handles
    // zero-copula via deep routing; here we just emit subject + adj
    // because synthesisIndex-based simple-render path lacks copula
    // logic.
    return {
      text: `${S} ${A}`,
      gloss: `[${subjectNoun}—${adjective}]`,
    };
  }

  if (shape.needsObject && objectNoun) {
    const oForm = lang.lexicon[objectNoun]!;
    const O = render(inflectNoun(oForm, lang, "O", objectNoun, rng, !!shape.pluralObject));
    const arranged = arrange(lang.grammar.wordOrder, S, V, O);
    if (shape.needsAdj && adjective) {
      const adjForm = lang.lexicon[adjective]!;
      const A = render(adjForm);
      // Phase 61: when shape.adjOnObject, render the adj inline next to
      // the object inside the SVO arrangement; otherwise keep the
      // legacy "S V O · A" trailing-modifier form.
      if (shape.adjOnObject) {
        const adjPos = lang.grammar.adjectivePosition ?? "pre";
        const objPhrase = adjPos === "post" ? `${O} ${A}` : `${A} ${O}`;
        const arr2 = arrange(lang.grammar.wordOrder, S, V, objPhrase);
        return {
          text: `${arr2.first} ${arr2.second} ${arr2.third}`,
          gloss: `[${subjectNoun}—${verb}—${adjective} ${objectNoun}]`,
        };
      }
      return {
        text: `${arranged.first} ${arranged.second} ${arranged.third} · ${A}`,
        gloss: `[${subjectNoun}—${verb}—${adjective} ${objectNoun}]`,
      };
    }
    return {
      text: `${arranged.first} ${arranged.second} ${arranged.third}`,
      gloss: `[${subjectNoun}—${verb}—${objectNoun}]`,
    };
  }

  if (shape.needsAdj && adjective) {
    const adjForm = lang.lexicon[adjective]!;
    const A = render(adjForm);
    return {
      text: `${A} ${S} ${V}`,
      gloss: `[${adjective} ${subjectNoun}—${verb}]`,
    };
  }

  return {
    text: `${S} ${V}`,
    gloss: `[${subjectNoun}—${verb}]`,
  };
}

export function randomNarrativeSeed(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 6; i++) {
    // Sanctioned exception to the "no Math.random outside rng.ts" rule:
    // this is a UI entropy source for a FRESH narrative seed (the
    // CompareView "new seed" button). The returned string then drives
    // generateNarrative() through a seeded Rng deterministically. It is
    // never reached from the simulation step pipeline, so it does not
    // affect simulation determinism.
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export function generateNarrative(
  lang: Language,
  seedStr: string,
  lines = 5,
  script: DisplayScript = "ipa",
): NarrativeLine[] {
  const skeletons = planSkeletonForLanguage(lang, seedStr, lines);
  const rng = makeRng(`narrative-realise:${lang.id}:${seedStr}`);
  const out: NarrativeLine[] = [];
  for (const skel of skeletons) {
    const line = realizeSkeleton(lang, skel, script, rng);
    if (line) out.push(line);
  }
  return out;
}
