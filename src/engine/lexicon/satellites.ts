import type { Language, Meaning, WordForm, FormVariant } from "../types";
import type { InflectionClass, NounDeclensionClass, MorphCategory } from "../morphology/types";
import { lexemeIdFor, type LexemeId } from "./lexemeIdentity";

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

/** Read-path key resolution: gloss → its id (no mint); a keyless/seeded id passes through. */
function readKey(lang: Language, key: string): string {
  if (lang.lexemes?.[key]) return key;            // already a record id
  return lang.lexemeIds?.[key] ?? key;            // gloss → id, else passthrough (yields no entry)
}
/** Write-path key resolution: a record id passes through; a gloss mints/looks up its id. */
function writeKey(lang: Language, key: string): LexemeId {
  if (lang.lexemes?.[key]) return key as LexemeId; // already an id → never mint a gloss
  return lexemeIdFor(lang as unknown as Parameters<typeof lexemeIdFor>[0], key as Meaning);
}

export function satGet<K extends SatField>(lang: Language, field: K, key: string): SatelliteTypes[K] | undefined {
  return mapOf(lang, field)?.[readKey(lang, key)];
}
export function satSet<K extends SatField>(lang: Language, field: K, key: string, value: SatelliteTypes[K]): void {
  ensureMap(lang, field)[writeKey(lang, key)] = value;
}
export function satHas<K extends SatField>(lang: Language, field: K, key: string): boolean {
  const m = mapOf(lang, field);
  return m ? readKey(lang, key) in m : false;
}
export function satDelete<K extends SatField>(lang: Language, field: K, key: string): void {
  const m = mapOf(lang, field);
  if (m) delete m[readKey(lang, key)];
}
export function satKeys<K extends SatField>(lang: Language, field: K): LexemeId[] {
  return Object.keys(mapOf(lang, field) ?? {}) as LexemeId[];
}
export function satEntries<K extends SatField>(lang: Language, field: K): Array<[LexemeId, SatelliteTypes[K]]> {
  const m = mapOf(lang, field);
  return m ? (Object.entries(m) as Array<[LexemeId, SatelliteTypes[K]]>) : [];
}
