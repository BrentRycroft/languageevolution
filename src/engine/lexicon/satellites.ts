import type { Language, Meaning, WordForm, FormVariant } from "../types";
import type { InflectionClass, NounDeclensionClass, MorphCategory } from "../morphology/types";
import type { LexemeId } from "./lexemeIdentity";

/**
 * satellites.ts — the typed accessor seam for the per-meaning satellite maps
 * (storage step 5 sub-project 2a). Storage is LexemeId-keyed; callers may pass
 * a gloss (seeded words) or a LexemeId (keyless words) and the seam resolves both.
 *
 * Value types are EXACTLY today's per-field value types — no value reshaping.
 */
export interface SatelliteTypes {
  wordFrequencyHints: number;
  lastChangeGeneration: number;
  wordOrigin: string;
  localNeighbors: string[];
  registerOf: "high" | "low";
  variants: FormVariant[];
  wordOriginChain: { tag: string; from?: Meaning; via?: string; donor?: string };
  colexifiedAs: Meaning[];
  inflectionClass: InflectionClass;
  nounDeclensionClass: NounDeclensionClass;
  ablautClassAssignment: number;
  grammaticalizationStage: {
    stage: 0 | 1 | 2 | 3 | 4;
    targetCategory?: MorphCategory;
    lastTransitionGen: number;
    affixForm?: WordForm;
  };
  suppletion: Partial<Record<MorphCategory, WordForm>>;
  etymology: Meaning[];
  /** S4: glided meaning positions (fixed-point ints as number[]). Sparse drift override. */
  meaningPoints: number[];
}
export type SatField = keyof SatelliteTypes;

type SatMap<K extends SatField> = Record<string, SatelliteTypes[K]>;
function mapOf<K extends SatField>(lang: Language, field: K): SatMap<K> | undefined {
  return (lang as unknown as Record<string, SatMap<K> | undefined>)[field];
}
function ensureMap<K extends SatField>(lang: Language, field: K): SatMap<K> {
  const rec = lang as unknown as Record<string, SatMap<K>>;
  return (rec[field] ??= {});
}

/**
 * Key resolution — read and write are SYMMETRIC and NEVER mint. A record id
 * (keyless or seeded) passes through; a gloss resolves to its existing id; a
 * gloss with no id passes through as itself (stored gloss-keyed, exactly as the
 * pre-flip direct writes did — they never minted either).
 *
 * Determinism: minting (`lexemeIdFor`) advances `conceptIdSeq`, which seeds every
 * downstream LexemeId and its per-word sound-change sub-rng. A satellite write
 * must therefore never mint — otherwise seeding a gloss that has no lexeme (e.g.
 * a non-lexicon `seedFrequencyHints` entry) would shift the whole id stream and
 * diverge GENN. Ids are minted only by the lexeme layer (`lexSet` /
 * `rekeyLexiconToLexemeIds`); the seam merely addresses what already exists.
 */
function resolveKey(lang: Language, key: string): string {
  if (lang.lexemes?.[key]) return key;            // already a record id
  return lang.lexemeIds?.[key] ?? key;            // gloss → id, else passthrough (no mint)
}

export function satGet<K extends SatField>(lang: Language, field: K, key: string): SatelliteTypes[K] | undefined {
  return mapOf(lang, field)?.[resolveKey(lang, key)];
}
export function satSet<K extends SatField>(lang: Language, field: K, key: string, value: SatelliteTypes[K]): void {
  ensureMap(lang, field)[resolveKey(lang, key)] = value;
}
export function satHas<K extends SatField>(lang: Language, field: K, key: string): boolean {
  const m = mapOf(lang, field);
  return m ? resolveKey(lang, key) in m : false;
}
export function satDelete<K extends SatField>(lang: Language, field: K, key: string): void {
  const m = mapOf(lang, field);
  if (m) delete m[resolveKey(lang, key)];
}
export function satKeys<K extends SatField>(lang: Language, field: K): LexemeId[] {
  return Object.keys(mapOf(lang, field) ?? {}) as LexemeId[];
}
export function satEntries<K extends SatField>(lang: Language, field: K): Array<[LexemeId, SatelliteTypes[K]]> {
  const m = mapOf(lang, field);
  return m ? (Object.entries(m) as Array<[LexemeId, SatelliteTypes[K]]>) : [];
}

/**
 * Seed the birth-time satellite fields a keyless lexeme gets at coinage (S2a),
 * keyed by its id. Mirrors the defaults a fresh seeded coinage receives
 * (frequency 0.4, register "low", origin marker, age = current generation).
 */
export function seedKeylessBirthSatellites(lang: Language, id: LexemeId, generation: number): void {
  satSet(lang, "wordFrequencyHints", id, 0.4);
  satSet(lang, "lastChangeGeneration", id, generation);
  satSet(lang, "wordOrigin", id, "keyless-gap");
  satSet(lang, "registerOf", id, "low");
}

/**
 * Rebuild a GLOSS-keyed view of a satellite field (gloss-bearing records only).
 * The phonology engine still indexes these maps by gloss at its boundary
 * (apply.ts), so the per-gen pass-through builds this adapter from the now
 * LexemeId-keyed storage. Byte-identical to the pre-flip gloss-keyed map.
 */
export function glossKeyedView<K extends SatField>(lang: Language, field: K): Record<Meaning, SatelliteTypes[K]> {
  const out: Record<string, SatelliteTypes[K]> = {};
  for (const [id, v] of satEntries(lang, field)) {
    const gloss = lang.lexemes?.[id]?.gloss;
    if (gloss !== undefined) out[gloss] = v;
  }
  return out;
}
