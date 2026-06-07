# Storage Step 5 — Sub-project 2a: Satellite-Map Re-key Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-key the 14 per-meaning satellite maps on `Language` from gloss-keyed (`Record<Meaning, X>`) to LexemeId-keyed (`Record<LexemeId, X>`) behind a new typed accessor seam, and give keyless words their birth-time satellite data — so keyless words become addressable in every satellite map.

**Architecture:** A single `lexicon/satellites.ts` choke point (generic `satGet/satSet/satHas/satDelete/satKeys/satEntries`) resolves a gloss **or** a LexemeId internally (a LexemeId is always `c_…`-prefixed and lives in `lang.lexemes`; a gloss lives in `lang.lexemeIds`). Each map is flipped to id-keyed and its call sites routed through the seam **atomically in its own task**, keeping every commit green. The re-key is an order-preserving relabel (target byte-identical GEN0+GENN); a per-map audit catches the one risky pattern (a loop body that consumes the iteration key as a gloss).

**Tech Stack:** TypeScript, Vitest. Determinism gate = `src/engine/__tests__/meaning_layer_baseline.test.ts` (RUN_SLOW). Branch `auto/storage-pointnative`.

**Approved spec:** `docs/superpowers/specs/2026-06-07-storage-step5-s2a-satellite-rekey-design.md`.

---

## Conventions (shared by every task — read once)

**The 14 maps in scope** (registry order): `wordFrequencyHints, lastChangeGeneration, wordOrigin, localNeighbors, registerOf, variants, wordOriginChain, colexifiedAs, inflectionClass, nounDeclensionClass, ablautClassAssignment, grammaticalizationStage, suppletion, etymology`. **NOT in scope:** `meaningPoints` (S4), `lexemeIds` (the index itself).

**The routing recipe** — applied to each map's call sites:

| Old (gloss-keyed direct access) | New (via seam) |
|---|---|
| `lang.FIELD[m]` (read) | `satGet(lang, "FIELD", m)` |
| `lang.FIELD[m] ?? DEFAULT` | `satGet(lang, "FIELD", m) ?? DEFAULT` |
| `lang.FIELD[m] = v` | `satSet(lang, "FIELD", m, v)` |
| `lang.FIELD[m] !== undefined` / `m in lang.FIELD` | `satHas(lang, "FIELD", m)` |
| `delete lang.FIELD[m]` | `satDelete(lang, "FIELD", m)` |
| `Object.keys(lang.FIELD)` | `satKeys(lang, "FIELD")` → **yields LexemeIds** |
| `Object.entries(lang.FIELD)` | `satEntries(lang, "FIELD")` → **`[id, value]`** |

`satSet` mints an id for a brand-new gloss (matching today's lazy-mint); `satGet`/`satHas`/`satDelete` never mint. `m` may be a gloss (seeded callers) or an id (keyless callers) — the seam resolves both.

**The one risky pattern (audit every iteration site):** after `satKeys`/`satEntries` the loop variable is a **LexemeId**, not a gloss. If the loop body uses it as a gloss — `lexGet(lang, m)`, `meaningPointFor(lang, m)`, `lang.lexemes[...]` by gloss, string-hashing it, seeding an RNG from it — that line must be converted:
- need the **word's form** → `lang.lexemes[id]?.form`
- need the **gloss string** → `meaningForLexemeId(lang, id)` (import from `./lexemeIdentity`) or emergent `keylessGloss(lang.lexemes[id]!)`
- a draw seeded from the key string → **STOP**, this map's re-key is a deliberate re-bake; record it for the Task 17 baseline.

**Do NOT touch** (already key-agnostic — they spread/`Object.entries` whatever keys exist): `src/engine/tree/split.ts`, `src/engine/utils/clone.ts`. Leave their satellite-map lines exactly as they are.

**Determinism gate commands** (PowerShell on win32; vitest ALWAYS scoped `--dir src`):
- Typecheck: `npx tsc --noEmit` → expect 0 errors.
- Targeted FAST: `npx vitest run --dir src <pattern>`.
- Baseline (RUN_SLOW): `$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`.

**Per-map task green bar:** after routing a map, run `npx tsc --noEmit` (0 errors) + that map's owning test files + `npx vitest run --dir src meaning_layer_baseline` is **not** run per-map (slow); instead run the FAST determinism proxy `npx vitest run --dir src lexical_diffusion` (the canary from S1 — fast, RNG-order-sensitive). Full baseline is Task 17. Commit only when tsc is clean and targeted tests pass.

**Commit trailer (every commit):**
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```
Local commits only — do NOT push or open a PR.

---

## Task 1: Accessor seam module (`lexicon/satellites.ts`)

**Files:**
- Create: `src/engine/lexicon/satellites.ts`
- Test: `src/engine/__tests__/satellites_seam.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/engine/__tests__/satellites_seam.test.ts
import { describe, it, expect } from "vitest";
import { satGet, satSet, satHas, satDelete, satKeys, satEntries } from "../lexicon/satellites";
import type { Language } from "../types";

// Minimal hand-built lang: one seeded gloss "fire" with an id, one keyless id.
function makeLang(): Language {
  const lang = {
    id: "root",
    lexemeIds: { fire: "c_aaaa_root_1" },
    lexemes: {
      "c_aaaa_root_1": { form: ["f", "i"], point: [0], gloss: "fire" },
      "c_bbbb_root_2": { form: ["k", "o"], point: [1] }, // keyless (no gloss)
    },
    wordFrequencyHints: {} as Record<string, number>,
  } as unknown as Language;
  return lang;
}

describe("satellites seam — gloss/id resolution", () => {
  it("satSet by gloss writes under the gloss's LexemeId; satGet by gloss reads it back", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "fire", 0.9);
    expect((lang.wordFrequencyHints as Record<string, number>)["c_aaaa_root_1"]).toBe(0.9);
    expect(satGet(lang, "wordFrequencyHints", "fire")).toBe(0.9);
  });

  it("satSet/satGet by keyless id round-trips without minting a gloss", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "c_bbbb_root_2", 0.3);
    expect(satGet(lang, "wordFrequencyHints", "c_bbbb_root_2")).toBe(0.3);
    expect(lang.lexemeIds!["c_bbbb_root_2"]).toBeUndefined(); // no spurious gloss entry
  });

  it("satGet for an unknown gloss returns undefined and does not mint", () => {
    const lang = makeLang();
    const before = Object.keys(lang.lexemeIds!).length;
    expect(satGet(lang, "wordFrequencyHints", "water")).toBeUndefined();
    expect(Object.keys(lang.lexemeIds!).length).toBe(before);
  });

  it("satHas / satDelete agree with satGet", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "fire", 0.5);
    expect(satHas(lang, "wordFrequencyHints", "fire")).toBe(true);
    satDelete(lang, "wordFrequencyHints", "fire");
    expect(satHas(lang, "wordFrequencyHints", "fire")).toBe(false);
    expect(satGet(lang, "wordFrequencyHints", "fire")).toBeUndefined();
  });

  it("satKeys yields LexemeIds in insertion order; satEntries pairs id→value", () => {
    const lang = makeLang();
    satSet(lang, "wordFrequencyHints", "fire", 0.5);
    satSet(lang, "wordFrequencyHints", "c_bbbb_root_2", 0.3);
    expect(satKeys(lang, "wordFrequencyHints")).toEqual(["c_aaaa_root_1", "c_bbbb_root_2"]);
    expect(satEntries(lang, "wordFrequencyHints")).toEqual([
      ["c_aaaa_root_1", 0.5],
      ["c_bbbb_root_2", 0.3],
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src satellites_seam`
Expected: FAIL — `Cannot find module '../lexicon/satellites'`.

- [ ] **Step 3: Implement the seam**

```ts
// src/engine/lexicon/satellites.ts
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
  return lexemeIdFor(lang, key as Meaning);
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --dir src satellites_seam` → expect PASS (5 tests).
Run: `npx tsc --noEmit` → expect 0 errors.

- [ ] **Step 5: Commit**

```
git add src/engine/lexicon/satellites.ts src/engine/__tests__/satellites_seam.test.ts
git commit -m "feat(storage): typed satellite accessor seam (S2a task 1, additive)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Registry `keyedBy` discriminator + purge + birth-seed helper

**Files:**
- Modify: `src/engine/perMeaningFields.ts` (interface + every spec entry + `purgeMeaningFromRegistry`)
- Modify: `src/engine/lexicon/satellites.ts` (add `seedKeylessBirthSatellites`)
- Modify: `src/engine/__tests__/phase72d_field_registry.test.ts` (route raw writes through the seam)
- Test: `src/engine/__tests__/satellites_seam.test.ts` (add purge + birth-seed cases)

Rationale: introduce the `keyedBy` discriminator with **every satellite field still `"gloss"`** (maps are not flipped yet, so behaviour is unchanged and the suite stays green). Each later per-map task flips its own field to `"lexemeId"` in lockstep with its storage. Also land the keyless birth-seed helper now (used by Task 15).

- [ ] **Step 1: Update the failing test first (registry test reflects the new contract)**

In `src/engine/__tests__/phase72d_field_registry.test.ts`, the "purgeMeaningFromRegistry removes every per-meaning entry" test writes maps by raw gloss key. Route those writes and assertions through the seam so the test survives later flips. Replace the body of that `it(...)` (lines ~29-55) with:

```ts
  it("purgeMeaningFromRegistry removes every per-meaning entry for a meaning", () => {
    const cfg = presetRomance();
    cfg.seed = "p72d-purge";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    const meaning = "test-meaning";
    satSet(lang, "wordFrequencyHints", meaning, 0.5);
    satSet(lang, "wordOrigin", meaning, "test");
    satSet(lang, "lastChangeGeneration", meaning, 0);
    satSet(lang, "inflectionClass", meaning, 1);
    satSet(lang, "nounDeclensionClass", meaning, 1);

    const purged = purgeMeaningFromRegistry(lang, meaning);
    expect(purged).toBeGreaterThanOrEqual(5);
    expect(satGet(lang, "wordFrequencyHints", meaning)).toBeUndefined();
    expect(satGet(lang, "wordOrigin", meaning)).toBeUndefined();
    expect(satGet(lang, "lastChangeGeneration", meaning)).toBeUndefined();
    expect(satGet(lang, "inflectionClass", meaning)).toBeUndefined();
    expect(satGet(lang, "nounDeclensionClass", meaning)).toBeUndefined();
  });
```

Add to that file's imports:
```ts
import { satGet, satSet } from "../lexicon/satellites";
```
Also update the "deleteMeaning routes through the registry" test's two trailing assertions (`lang.wordOrigin[meaning]` / `lang.wordFrequencyHints[meaning]`) to `satGet(lang, "wordOrigin", meaning)` / `satGet(lang, "wordFrequencyHints", meaning)`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src phase72d_field_registry`
Expected: FAIL — `purgeMeaningFromRegistry` does not yet resolve via `keyedBy` (it will still pass here because maps are gloss-keyed and seam writes by gloss → so this step may PASS). If it passes, that is acceptable — proceed; the discriminator is still required for the per-map flips. The genuine fail-first is the seam unit test in Step 4.

- [ ] **Step 3: Add `keyedBy` to the registry + branch the purge**

In `src/engine/perMeaningFields.ts`:

Add to `PerMeaningFieldSpec`:
```ts
  /** Key space of this map. Satellite maps re-keyed in S2a are "lexemeId"; the
   *  lexemeIds index stays "gloss". Drives purge key resolution. */
  keyedBy: "gloss" | "lexemeId";
```

Add `keyedBy: "gloss"` to **every** entry in `PER_MEANING_FIELDS` for now (all 15 entries incl. `lexemeIds`). (Per-map tasks flip the 14 satellite entries to `"lexemeId"`; `lexemeIds` stays `"gloss"` permanently.)

Rewrite `purgeMeaningFromRegistry` to resolve the key per field:
```ts
import { lexemeIdFor } from "./lexicon/lexemeIdentity";

export function purgeMeaningFromRegistry(lang: Language, meaning: Meaning): number {
  let count = 0;
  const langAsRecord = lang as unknown as Record<string, Record<string, unknown> | undefined>;
  for (const spec of PER_MEANING_FIELDS) {
    if (!spec.purgeOnDelete) continue;
    const map = langAsRecord[spec.key];
    if (!map) continue;
    const key = spec.keyedBy === "lexemeId" ? (lexemeIdFor(lang, meaning) as string) : (meaning as string);
    if (Object.prototype.hasOwnProperty.call(map, key)) {
      delete map[key];
      count++;
    }
  }
  return count;
}
```

- [ ] **Step 4: Add seam birth-seed helper + tests**

In `src/engine/lexicon/satellites.ts` add:
```ts
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
```

Append to `src/engine/__tests__/satellites_seam.test.ts`:
```ts
import { seedKeylessBirthSatellites } from "../lexicon/satellites";

describe("seedKeylessBirthSatellites", () => {
  it("seeds the four birth-time fields under the keyless id, none of the lazy maps", () => {
    const lang = {
      id: "root", lexemeIds: {}, lexemes: { "c_bbbb_root_2": { form: ["k"], point: [1] } },
    } as unknown as import("../types").Language;
    seedKeylessBirthSatellites(lang, "c_bbbb_root_2" as any, 7);
    expect(satGet(lang, "wordFrequencyHints", "c_bbbb_root_2")).toBe(0.4);
    expect(satGet(lang, "lastChangeGeneration", "c_bbbb_root_2")).toBe(7);
    expect(satGet(lang, "wordOrigin", "c_bbbb_root_2")).toBe("keyless-gap");
    expect(satGet(lang, "registerOf", "c_bbbb_root_2")).toBe("low");
    expect(satGet(lang, "variants", "c_bbbb_root_2")).toBeUndefined();
    expect(satGet(lang, "suppletion", "c_bbbb_root_2")).toBeUndefined();
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run --dir src satellites_seam phase72d_field_registry` → expect PASS.
Run: `npx tsc --noEmit` → expect 0 errors.

- [ ] **Step 6: Commit**

```
git add src/engine/perMeaningFields.ts src/engine/lexicon/satellites.ts src/engine/__tests__/phase72d_field_registry.test.ts src/engine/__tests__/satellites_seam.test.ts
git commit -m "feat(storage): registry keyedBy discriminator + keyless birth-seed helper (S2a task 2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Per-map tasks (3–16) — shared structure

Each per-map task does exactly this (apply the **routing recipe** and **iteration audit** from Conventions):

1. **Flip the type** in `src/engine/types.ts`: change `FIELD…: Record<Meaning, X>` → `Record<LexemeId, X>` (value `X` unchanged). `LexemeId` is already imported in `types.ts` (used by `lexemes`/`lexiconUR`); if not, add `import type { LexemeId } from "./lexicon/lexemeIdentity"` — verify before adding.
2. **Flip the registry entry** for `FIELD` in `perMeaningFields.ts`: `keyedBy: "gloss"` → `keyedBy: "lexemeId"`.
3. **Route every call site** in the listed files through the seam (recipe table). Add `import { satGet, satSet, satHas, satDelete, satKeys, satEntries } from "../lexicon/satellites"` (adjust depth) to each file you touch — import only the helpers you use.
4. **Audit iteration sites** (the per-task "⚠ iteration sites" callout) — convert any loop body that used the key as a gloss.
5. **Leave `tree/split.ts` and `utils/clone.ts` untouched** (key-agnostic).
6. **Verify:** `npx tsc --noEmit` (0 errors) + the task's named test files + `npx vitest run --dir src lexical_diffusion` (fast RNG-order canary — expect PASS, proving order-preservation). Commit.

> If `lexical_diffusion` goes RED after a map flip, you reordered something: the map is being **written** in a different order than before (insertion order not preserved) or an iteration body seeds RNG from the key. Re-check the routed sites before treating it as a deliberate re-bake.

---

### Task 3: `wordFrequencyHints` (83 sites — biggest)

**Files (route all `.wordFrequencyHints[` sites):**
- Modify: `src/engine/types.ts` (type flip), `src/engine/perMeaningFields.ts` (keyedBy)
- Modify: `contact/borrow.ts`, `genesis/need.ts`, `lexicon/altForms.ts`, `lexicon/disambiguate.ts`, `lexicon/frequencyDynamics.ts`, `lexicon/mutate.ts`, `lexicon/reanalysis.ts`, `lexicon/synonyms.ts`, `lexicon/taboo.ts`, `lexicon/univerbation.ts`, `lexicon/variants.ts`, `lexicon/word.ts`, `modules/semantic/frequency.ts`, `morphology/ablaut.ts`, `morphology/evolve.ts`, `narrative/generate.ts`, `narrative/pools.ts`, `phonology/orthography.ts`, `phonology/pruning.ts`, `phonology/regular.ts`, `semantics/bleaching.ts`, `semantics/drift.ts`, `semantics/recarve.ts`, `steps/copula.ts`, `steps/genesis.ts`, `steps/init.ts`, `steps/learner.ts`, `steps/obsolescence.ts`, `steps/phonology.ts` (all under `src/engine/`)
- **Skip:** `tree/split.ts`, `utils/clone.ts`.

**⚠ iteration sites:** none over `wordFrequencyHints` itself (no `Object.keys(lang.wordFrequencyHints)` in production). All sites are point-lookup or assignment → pure recipe. Note `contact/borrow.ts` has the `Math.max(recipient.wordFrequencyHints[meaning] ?? 0, …)` pattern → `satSet(lang,"wordFrequencyHints", m, Math.max(satGet(lang,"wordFrequencyHints", m) ?? 0, …))`.

- [ ] **Step 1:** Flip the type in `types.ts` and `keyedBy` in `perMeaningFields.ts`.
- [ ] **Step 2:** Run `npx tsc --noEmit` → expect MANY errors (every site is now type-mismatched: indexing `Record<LexemeId,…>` with a `Meaning`). Use the error list as your worklist.
- [ ] **Step 3:** Route each site per the recipe until `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** Run owning tests:
  `npx vitest run --dir src frequency frequencyDynamics taboo obsolescence lexical_diffusion`
  Expected: PASS.
- [ ] **Step 5:** Commit:
```
git add -A
git commit -m "refactor(storage): re-key wordFrequencyHints to LexemeId via satellite seam (S2a task 3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `wordOrigin` (32) + `wordOriginChain` (5) — the provenance pair

**Files:** `types.ts`, `perMeaningFields.ts`, plus (route `.wordOrigin[` and `.wordOriginChain[`):
`lexicon/mutate.ts`, `lexicon/taboo.ts`, `lexicon/univerbation.ts`, `lexicon/word.ts`, `modules/semantic/lexicon.ts`, `morphology/evolve.ts`, `phonology/regular.ts`, `semantics/drift.ts`, `semantics/recarve.ts`, `steps/contact.ts`, `steps/copula.ts`, `steps/creolization.ts`, `steps/genesis.ts`, `steps/init.ts`, `steps/phonology.ts`, `translator/gracefulFallback.ts`, `genesis/apply.ts`, `genesis/mechanisms/targetedDerivation.ts`. **Skip** `tree/split.ts`.

**⚠ iteration sites:** none over either map. Pure recipe (both are point-lookup/assignment string maps).

- [ ] **Step 1:** Flip both types + both `keyedBy`.
- [ ] **Step 2:** `npx tsc --noEmit` → worklist of errors.
- [ ] **Step 3:** Route per recipe → tsc 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src lexicon univerbation taboo lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key wordOrigin + wordOriginChain via seam (S2a task 4)` (+ trailer).

---

### Task 5: `lastChangeGeneration` (16)

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `lexicon/mutate.ts`, `modules/semantic/lexicon.ts`, `phonology/regular.ts`, `semantics/drift.ts`, `steps/copula.ts`, `steps/learner.ts`, `steps/phonology.ts`. **Skip** `tree/split.ts`.

**⚠ iteration sites:** none. Point-lookup `number` map (the sound-change age clock) → pure recipe.

- [ ] **Step 1–3:** Flip type + keyedBy; `npx tsc --noEmit`; route per recipe → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src phonology learner lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key lastChangeGeneration via seam (S2a task 5)` (+ trailer).

---

### Task 6: `registerOf` (9)

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `achievements/catalog.ts`, `contact/borrow.ts`, `lexicon/mutate.ts`, `lexicon/word.ts`, `modules/semantic/frequency.ts`, `phonology/apply.ts`, `phonology/regular.ts`, `semantics/drift.ts`, `semantics/recarve.ts`, `steps/genesis.ts`, `steps/phonology.ts`. **Skip** `tree/split.ts`.

**⚠ iteration sites:** none over `registerOf` in production → pure recipe. Note `steps/genesis.ts:343` `if (lang.registerOf && !lang.registerOf[outcome.meaning])` → `if (!satHas(lang,"registerOf", outcome.meaning))`.

- [ ] **Step 1–3:** Flip; tsc worklist; route → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src register sociolinguistic drift lexical_diffusion` (ignore unmatched patterns) → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key registerOf via seam (S2a task 6)` (+ trailer).

---

### Task 7: `localNeighbors` (8)

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `lexicon/word.ts`, `modules/semantic/lexicon.ts`, `phonology/regular.ts`, `steps/genesis.ts`, `steps/phonology.ts`, `steps/semantics.ts`. **Skip** `tree/split.ts`, `utils/clone.ts`.

**⚠ iteration sites:** none in production (the only `Object.entries(lang.localNeighbors)` is in `clone.ts`, which we skip). `localNeighbors` values are `string[]` of **gloss** neighbour labels — the VALUES stay glosses (they are semantic-neighbour labels, not keys); only the OUTER key flips. Do not touch the value arrays.

- [ ] **Step 1–3:** Flip; tsc worklist; route → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src neighbor semantics genesis lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key localNeighbors via seam (S2a task 7)` (+ trailer).

---

### Task 8: `inflectionClass` (10) + `nounDeclensionClass` (9) — the morphology-class pair

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `contact/borrow.ts`, `morphology/inflectionClass.ts`, `steps/genesis.ts`. **Skip** `tree/split.ts`.

**⚠ iteration sites:** none over either map → pure recipe.

- [ ] **Step 1–3:** Flip both types + both keyedBy; tsc worklist; route → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src inflection declension morphology lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key inflectionClass + nounDeclensionClass via seam (S2a task 8)` (+ trailer).

---

### Task 9: `ablautClassAssignment` (3) — **has a gloss-in-loop iteration site**

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `morphology/ablaut.ts`, `morphology/apply.ts`. **Skip** `tree/split.ts`.

**⚠ iteration site — `morphology/ablaut.ts:199`:**
```ts
// BEFORE
for (const m of Object.keys(lang.ablautClassAssignment)) {
  const f = lexGet(lang, m);
  if (!f) continue;
  const hasMatch = f.some((p) => past.ablautMap![stripTone(p)] !== undefined);
  if (!hasMatch) delete lang.ablautClassAssignment[m];
}
// AFTER (loop var is now a LexemeId; use the record form directly, delete via seam)
for (const id of satKeys(lang, "ablautClassAssignment")) {
  const f = lang.lexemes[id]?.form;
  if (!f) continue;
  const hasMatch = f.some((p) => past.ablautMap![stripTone(p)] !== undefined);
  if (!hasMatch) satDelete(lang, "ablautClassAssignment", id);
}
```
No RNG in this loop → order-insensitive; the conversion is value-preserving.

- [ ] **Step 1–3:** Flip type + keyedBy; convert the iteration site above; route the `morphology/apply.ts` point-lookup sites per recipe; `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src ablaut lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key ablautClassAssignment via seam (S2a task 9)` (+ trailer).

---

### Task 10: `grammaticalizationStage` (5) — **iteration site (audit for gloss use)**

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `morphology/evolve.ts`, `steps/grammar.ts`. **Skip** `tree/split.ts`.

**⚠ iteration site — `morphology/evolve.ts:217`** `for (const [m, st] of Object.entries(lang.grammaticalizationStage))`. Convert to `for (const [id, st] of satEntries(lang, "grammaticalizationStage"))`. Then audit the loop body: every use of `m` as a gloss (e.g. `lexGet(lang, m)`, `lang.lexemes[…]`, writing other satellite maps by `m`) becomes either `lang.lexemes[id]?.form` (for the form) or `satSet/satGet(lang, "<otherField>", id, …)` (other satellite maps are also id-keyed by their own tasks — pass `id` straight through, the seam accepts it). If a `lexGet(lang, m)` remains, replace with the record form.

- [ ] **Step 1–3:** Flip type + keyedBy; convert the iteration site + audit body; route remaining point-lookup sites; `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src grammaticalization grammar evolve lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key grammaticalizationStage via seam (S2a task 10)` (+ trailer).

---

### Task 11: `suppletion` (14) — **RNG-coupled iteration site**

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `morphology/analogy.ts`, `morphology/conjugation.ts`, `morphology/evolve.ts`, `semantics/recarve.ts`, `steps/creolization.ts`, `steps/phonology.ts`, `translator/reverse.ts`. **Skip** `tree/split.ts`, `utils/clone.ts`.

**⚠ iteration site — `steps/phonology.ts:411`** (RNG-coupled — `rng.chance(0.5)` per slot):
```ts
// BEFORE
for (const meaning of Object.keys(lang.suppletion)) {
  const slots = lang.suppletion[meaning]!;
  ...
}
// AFTER — loop var unused as a gloss (only indexes the map) → just swap the key source
for (const id of satKeys(lang, "suppletion")) {
  const slots = satGet(lang, "suppletion", id)!;
  ...
}
```
Order is preserved (insertion order), so the per-slot `rng.chance(0.5)` draw sequence is byte-identical.

**⚠ iteration site — `translator/reverse.ts:118`** `for (const meaning of Object.keys(lang.suppletion))`: audit the body — the reverse translator likely uses `meaning` as a **gloss** to render output. Convert the loop to `satEntries`/`satKeys` and resolve the gloss with `meaningForLexemeId(lang, id)` where the body needs the human label. (No RNG here.)

- [ ] **Step 1–3:** Flip type + keyedBy; convert both iteration sites; route the remaining point-lookup sites; `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src suppletion conjugation analogy reverse lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key suppletion via seam (S2a task 11)` (+ trailer).

---

### Task 12: `variants` (12) — **RNG-coupled iteration sites**

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `lexicon/socialContagion.ts`, `lexicon/variants.ts`, `morphology/apply.ts`, `morphology/evolve.ts`, `steps/phonology.ts`. **Skip** `tree/split.ts`.

**⚠ iteration sites:**
- `lexicon/variants.ts:77` `const meanings = Object.keys(lang.variants)` → `const meanings = satKeys(lang, "variants")`; audit the body for any gloss use of `meanings[i]` (if it calls `lexGet`/renders a label, convert via record form / `meaningForLexemeId`).
- `lexicon/socialContagion.ts:106` `for (const m of Object.keys(lang.variants))` → `for (const m of satKeys(lang, "variants"))`; audit body (this one draws RNG for contagion — order is preserved, so byte-identical, but verify the body's use of `m`).
- `lexicon/variants.ts:122` / `socialContagion.ts:178` `if (Object.keys(lang.variants).length === 0) delete lang.variants` → `if (satKeys(lang, "variants").length === 0) delete lang.variants`.

- [ ] **Step 1–3:** Flip type + keyedBy; convert iteration sites; route point-lookup sites; `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src variant socialContagion lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key variants via seam (S2a task 12)` (+ trailer).

---

### Task 13: `colexifiedAs` (1 index + iteration) — **value array holds glosses**

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `diagnostics/scorecard.ts`, `lexicon/lookup.ts`, `lexicon/word.ts`, `modules/semantic/colexification.ts`, `semantics/colexification.ts`, `steps/init.ts`. **Skip** `tree/split.ts`, `utils/clone.ts`.

**Important:** `colexifiedAs: Record<Meaning, Meaning[]>` — only the OUTER key flips to LexemeId; the value array stays a list of **gloss** partners (do not convert the values).

**⚠ iteration sites:**
- `lexicon/lookup.ts:126` `for (const [winner, losers] of Object.entries(lang.colexifiedAs))` → `for (const [winnerId, losers] of satEntries(lang, "colexifiedAs"))`; audit: if the body uses `winner` as a gloss label, resolve `meaningForLexemeId(lang, winnerId)`.
- `lexicon/word.ts:688` `for (const [m, partners] of Object.entries(lang.colexifiedAs))` → `satEntries`; same audit.

- [ ] **Step 1–3:** Flip type + keyedBy; convert iteration sites; route the single index site; `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src colexif lookup lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key colexifiedAs via seam (S2a task 13)` (+ trailer).

---

### Task 14: `etymology` (1) — display-only

**Files:** `types.ts`, `perMeaningFields.ts`, plus: `presets/english.ts`, `presets/germanic.ts`, `presets/romance.ts`, `semantics/languageMorphemes.ts`, `steps/init.ts`. **Skip** `utils/clone.ts`.

**Important:** `etymology: Record<Meaning, Meaning[]>` — outer key flips; the value array stays gloss parts. Preset authoring blocks write `etymology` by gloss → route through `satSet(lang, "etymology", gloss, parts)` (these run at seed time, ids exist after `rekeyLexiconToLexemeIds`; verify ordering — if a preset writes etymology BEFORE ids are minted, `satSet` mints on demand, which is fine and deterministic).

**⚠ iteration sites:** none in production (`clone.ts` only, skipped).

- [ ] **Step 1–3:** Flip type + keyedBy; route preset/init writes; `npx tsc --noEmit` → 0 errors.
- [ ] **Step 4:** `npx vitest run --dir src etymology init lexical_diffusion` → PASS.
- [ ] **Step 5:** Commit `refactor(storage): re-key etymology via seam (S2a task 14)` (+ trailer).

---

## Task 15: Birth-time keyless population at coinage

**Files:**
- Modify: `src/engine/lexicon/lexemeIdentity.ts` (`coinKeylessLexeme` accepts optional generation, calls birth-seed)
- Modify: `src/engine/genesis/semanticGap.ts` (`coinKeylessForGap` threads generation)
- Modify: `src/engine/steps/genesis.ts:421` (pass `generation`)
- Test: `src/engine/__tests__/keyless_gap_coinage.test.ts` (assert birth-time fields present)

- [ ] **Step 1: Write the failing test** — append to `keyless_gap_coinage.test.ts` (add `import { satGet } from "../lexicon/satellites";` to the file's imports):

```ts
describe("keyless birth-time satellite population (S2a task 15)", () => {
  it("a coined keyless word gets frequency / age / origin / register under its id", () => {
    const lang = rootLang();
    const gap: SemanticGap = {
      point: meaningPointFor(lang, "whale"), gloss: "whale",
      nearestExistingDistSq: 1_000_000_000, neighborSupport: 5,
    };
    const id = coinKeylessForGap(lang, gap, 12);
    expect(id).not.toBeNull();
    expect(satGet(lang, "wordFrequencyHints", id!)).toBe(0.4);
    expect(satGet(lang, "lastChangeGeneration", id!)).toBe(12);
    expect(satGet(lang, "wordOrigin", id!)).toBe("keyless-gap");
    expect(satGet(lang, "registerOf", id!)).toBe("low");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src keyless_gap_coinage`
Expected: FAIL — `coinKeylessForGap` takes 2 args (TS error) and birth fields absent.

- [ ] **Step 3: Thread generation + seed**

`lexemeIdentity.ts` — `coinKeylessLexeme`:
```ts
import { seedKeylessBirthSatellites } from "./satellites";

export function coinKeylessLexeme(lang: Language, point: Vec, form: WordForm, generation = 0): LexemeId {
  const id = mintLexemeId(lang);
  lang.lexemes[id] = { form: form.slice(), point: Array.from(point) }; // no gloss => keyless
  seedKeylessBirthSatellites(lang, id, generation);
  return id;
}
```
`genesis/semanticGap.ts` — `coinKeylessForGap`:
```ts
export function coinKeylessForGap(lang: Language, gap: SemanticGap, generation = 0): LexemeId | null {
  ...
  return coinKeylessLexeme(lang, gap.point, composed.form, generation);
}
```
`steps/genesis.ts:421`:
```ts
if (gap) coinKeylessForGap(lang, gap, generation);
```

> **Determinism note:** this ADDS four satellite entries per keyless coinage, keyed by the keyless id. Those four maps are point-lookup only (never iterated in an RNG-coupled seeded path), and keyless forms are excluded from the baseline `signature()`. Therefore the baseline should stay byte-identical. Confirm in Task 17; if `lastChangeGeneration` now alters the keyless word's own sweep timing, that is invisible to `signature()` (keyless excluded) — acceptable.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --dir src keyless_gap_coinage` → PASS.
Run: `npx tsc --noEmit` → 0 errors.

- [ ] **Step 5: Commit** `feat(storage): birth-time satellite data for keyless coinages (S2a task 15)` (+ trailer).

---

## Task 16: Back-compat load migration (old gloss-keyed saves → id-keyed)

**Files:**
- Modify: `src/engine/lexicon/store.ts` (add `migrateSatelliteMaps`)
- Modify: `src/engine/simulation.ts` (call it in `restoreState`, right after `migrateLexemeStore(lang)`)
- Test: `src/engine/__tests__/lexeme_store.test.ts` (old-shape satellite fixture round-trips)

- [ ] **Step 1: Write the failing test** — append to `lexeme_store.test.ts`:

```ts
import { migrateSatelliteMaps } from "../lexicon/store";

describe("migrateSatelliteMaps (S2a task 16)", () => {
  it("re-keys gloss-keyed satellite maps to LexemeId; no-op when already id-keyed", () => {
    const lang = {
      id: "root",
      lexemeIds: { fire: "c_aaaa_root_1" },
      lexemes: { "c_aaaa_root_1": { form: ["f"], point: [0], gloss: "fire" } },
      wordFrequencyHints: { fire: 0.7 },          // OLD shape: gloss-keyed
      wordOrigin: { fire: "seed" },
    } as any;
    migrateSatelliteMaps(lang);
    expect(lang.wordFrequencyHints["c_aaaa_root_1"]).toBe(0.7);
    expect(lang.wordFrequencyHints["fire"]).toBeUndefined();
    expect(lang.wordOrigin["c_aaaa_root_1"]).toBe("seed");
    // idempotent: running again leaves it id-keyed
    migrateSatelliteMaps(lang);
    expect(lang.wordFrequencyHints["c_aaaa_root_1"]).toBe(0.7);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run --dir src lexeme_store` → FAIL (`migrateSatelliteMaps` not exported).

- [ ] **Step 3: Implement the migration**

In `src/engine/lexicon/store.ts`:
```ts
import { lexemeIdFor } from "./lexemeIdentity";

/** The 14 S2a-rekeyed satellite fields (must mirror perMeaningFields keyedBy:"lexemeId"). */
const SATELLITE_FIELDS = [
  "wordFrequencyHints", "lastChangeGeneration", "wordOrigin", "localNeighbors",
  "registerOf", "variants", "wordOriginChain", "colexifiedAs", "inflectionClass",
  "nounDeclensionClass", "ablautClassAssignment", "grammaticalizationStage",
  "suppletion", "etymology",
] as const;

/**
 * Back-compat (S2a task 16): re-key OLD-shape gloss-keyed satellite maps to
 * LexemeId. A key already present in `lang.lexemes` (an id) is left as-is, so
 * this is a no-op for new saves and idempotent. Glosses with no minted id get
 * one via lexemeIdFor. Deterministic: glosses processed in sorted order.
 */
export function migrateSatelliteMaps(lang: {
  lexemes?: Record<string, unknown>;
  lexemeIds?: Record<string, string>;
} & Record<string, unknown>): void {
  for (const field of SATELLITE_FIELDS) {
    const map = lang[field] as Record<string, unknown> | undefined;
    if (!map) continue;
    const glossKeys = Object.keys(map).filter((k) => !(lang.lexemes && k in lang.lexemes)).sort();
    for (const gloss of glossKeys) {
      const id = lexemeIdFor(lang as never, gloss);
      if (id === gloss) continue;
      map[id] = map[gloss];
      delete map[gloss];
    }
  }
}
```

In `src/engine/simulation.ts`, in `restoreState`'s per-language loop, immediately after the existing `migrateLexemeStore(lang);`:
```ts
migrateSatelliteMaps(lang);
```
(Import `migrateSatelliteMaps` alongside the existing `migrateLexemeStore` import.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --dir src lexeme_store` → PASS.
Run: `npx tsc --noEmit` → 0 errors.
Run a round-trip safety net: `npx vitest run --dir src roundtrip persistence` → PASS.

- [ ] **Step 5: Commit** `feat(storage): load-time migration of old gloss-keyed satellite maps (S2a task 16)` (+ trailer).

---

## Task 17: Baseline verification / re-bake + full green

**Files:**
- Possibly modify: `src/engine/__tests__/meaning_layer_baseline.test.ts` (GENN table — only if an audited map genuinely re-baked)

- [ ] **Step 1: Run the determinism gate**

Run: `$env:RUN_SLOW=1; npx vitest run --dir src meaning_layer_baseline; $env:RUN_SLOW=$null`
Expected: **GEN0 byte-identical** (no change). **GENN byte-identical** for all 6 presets (the re-key is an order-preserving relabel and keyless birth data is invisible to `signature()`).

- [ ] **Step 2: If any preset's GENN differs**

Only acceptable if traced to an audited iteration site with a genuine key-string dependency (per Conventions). If so:
1. Re-run the baseline a SECOND time → confirm the new hash is identical across runs (reproducibility).
2. Update that preset's GENN hash in the table (line ~332) with a dated comment:
   `// S2a (2026-06-07): <preset> GENN re-baked — <map> iteration seeds from <what>; reproducible (twice).`
3. If a preset differs and you CANNOT trace it to a key-string dependency, **STOP** — it is an order bug in a routed map; bisect by `git stash`-testing each per-map commit against `lexical_diffusion`.

- [ ] **Step 3: Full FAST suite**

Run: `npx vitest run --dir src`
Expected: green (allow the project's known skips). Fix any behavioural-test fallout from iteration-site loop-variable changes (a test asserting a gloss key in a now-id-keyed map → route it through `satGet`/`satKeys`, the same stale-contract fix as the registry test in Task 2).

- [ ] **Step 4: Full RUN_SLOW safety net**

Run: `$env:RUN_SLOW=1; npx vitest run --dir src; $env:RUN_SLOW=$null`
Expected: green.

- [ ] **Step 5: Commit** (only if the baseline table or any test changed)

```
git add -A
git commit -m "test(storage): S2a baseline verification — satellite re-key byte-identical (S2a task 17)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 18: Documentation + memory

**Files:**
- Modify: `docs/planning/archive/CONCEPT-KEYED-STORAGE-deferred-migration.md` (mark S2a done under the step-5 ledger)
- Modify: `C:\Users\brent\.claude\projects\c--dev-languageevolution\memory\vector-native-lexicon-flip-active.md` + `MEMORY.md` pointer (S2a complete; S2b is next)

- [ ] **Step 1:** Add an S2a-DONE entry to the archive doc's "Sub-projects 2-6 REMAIN" list: the task ledger (T1–T18 SHAs), the determinism outcome (byte-identical or which preset re-baked), and that S2b (process-widening) is next.
- [ ] **Step 2:** Update the memory file: S2a COMPLETE with ledger; S2b NEXT (widen the ~7 lazily-owned processes so keyless words participate); note the new `lexicon/satellites.ts` seam and the `keyedBy` registry discriminator.
- [ ] **Step 3: Commit** `docs: mark storage step-5 sub-project 2a (satellite re-key) DONE` (+ trailer).

---

## Final review (controller, after all tasks)

Dispatch a final code-review subagent over the whole S2a diff (`git diff a-base..HEAD` where a-base is the commit before Task 1). Confirm: no direct `lang.<satelliteField>[…]` indexing remains outside `satellites.ts`/`tree/split.ts`/`utils/clone.ts`; every flipped field has `keyedBy:"lexemeId"`; `meaningPoints`/`lexemeIds` untouched; baseline GEN0 byte-identical. Then use **superpowers:finishing-a-development-branch** (the branch stays local — do NOT push or PR unless the user asks).
```
