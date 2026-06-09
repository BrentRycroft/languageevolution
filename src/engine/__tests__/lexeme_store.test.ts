import { describe, it, expect } from "vitest";
import {
  recordForm, setRecordForm, formViewOf, seededFormViewOf, mergeFormsIntoStore, migrateLexemeStore,
  migrateSatelliteMaps,
} from "../lexicon/store";
import type { LexemeStore } from "../primitives";
import { createSimulation } from "../simulation";
import { presetEnglish } from "../presets/english";
import { tForm as lexGet, tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";
import { lexPoint } from "../semantics/meaningPoint";

describe("lexeme store primitives", () => {
  it("reads a record's form", () => {
    const store: LexemeStore = { "id-1": { form: ["a", "b"], point: [1, 2], gloss: "water" } };
    expect(recordForm(store, "id-1")).toEqual(["a", "b"]);
    expect(recordForm(store, "missing")).toBeUndefined();
  });

  it("setRecordForm updates form in place, preserving point + gloss", () => {
    const store: LexemeStore = { "id-1": { form: ["a"], point: [1], gloss: "water" } };
    setRecordForm(store, "id-1", ["x", "y"]);
    expect(store["id-1"]).toEqual({ form: ["x", "y"], point: [1], gloss: "water" });
  });

  it("formViewOf projects ALL records' forms; seededFormViewOf excludes keyless (no gloss)", () => {
    const store: LexemeStore = {
      "id-1": { form: ["a"], point: [1], gloss: "water" },
      "id-2": { form: ["b"], point: [2] }, // keyless
    };
    expect(formViewOf(store)).toEqual({ "id-1": ["a"], "id-2": ["b"] });
    expect(seededFormViewOf(store)).toEqual({ "id-1": ["a"] }); // keyless excluded
  });

  it("mergeFormsIntoStore reconciles ONLY the swept set: updates forms, drops merged-away, leaves the rest", () => {
    const store: LexemeStore = {
      "id-1": { form: ["a"], point: [1], gloss: "water" },
      "id-2": { form: ["b"], point: [2], gloss: "fire" },
      "id-3": { form: ["c"], point: [3] }, // keyless — NOT in the swept view, must survive untouched
    };
    const before = { "id-1": ["a"], "id-2": ["b"] }; // the swept view
    mergeFormsIntoStore(store, before, { "id-1": ["a", "a"] }); // id-2 merged away during sound change
    expect(store["id-1"]).toEqual({ form: ["a", "a"], point: [1], gloss: "water" });
    expect(store["id-2"]).toBeUndefined();
    expect(store["id-3"]).toEqual({ form: ["c"], point: [3] });
  });
});

describe("lang.lexemes is the canonical store after birth (S1 task 2)", () => {
  const root = () => {
    const s = createSimulation(presetEnglish()).getState();
    return s.tree[s.rootId]!.language;
  };

  it("every seeded gloss resolves to a record with form + materialized point + gloss", () => {
    const lang = root();
    for (const m of lexKeys(lang)) {
      const id = lang.lexemeIds![m]!;
      const rec = lang.lexemes[id]!;
      expect(rec).toBeDefined();
      expect(rec.form).toEqual(lexGet(lang, m));
      expect(rec.gloss).toBe(m);
      expect(rec.point).toEqual(Array.from(lexPoint(m))); // materialized = today's derived point
    }
  });

  it("the legacy `lexicon` field is gone", () => {
    expect((root() as unknown as { lexicon?: unknown }).lexicon).toBeUndefined();
  });
});

describe("migrateLexemeStore — old-save back-compat (S1 task 5)", () => {
  it("converts an old-shape language (lexicon + keylessLexemes) into lang.lexemes", () => {
    const old = {
      lexemeIds: { water: "id-w" },
      lexicon: { "id-w": ["w", "a"] },
      keylessLexemes: { "id-k": { form: ["z"], point: [1, 2] } },
    };
    migrateLexemeStore(old);
    const lang = old as unknown as { lexemes: LexemeStore; lexicon?: unknown; keylessLexemes?: unknown };
    expect(lang.lexemes["id-w"]).toEqual({ form: ["w", "a"], point: expect.any(Array), gloss: "water" });
    expect(lang.lexemes["id-w"]!.point).toEqual(Array.from(lexPoint("water"))); // materialized
    expect(lang.lexemes["id-k"]).toEqual({ form: ["z"], point: [1, 2] }); // keyless, no gloss
    expect(lang.lexemes["id-k"]!.gloss).toBeUndefined();
    expect(lang.lexicon).toBeUndefined();
    expect(lang.keylessLexemes).toBeUndefined();
  });

  it("is a no-op when lang.lexemes already exists (new-shape save)", () => {
    const fresh = { lexemes: { "id-1": { form: ["q"], point: [3], gloss: "x" } } } as { lexemes: LexemeStore };
    const sameRef = fresh.lexemes;
    migrateLexemeStore(fresh);
    expect(fresh.lexemes).toBe(sameRef); // untouched
  });
});

describe("migrateSatelliteMaps (S2a task 16)", () => {
  it("re-keys gloss-keyed satellite maps to LexemeId; no-op when already id-keyed", () => {
    const lang = {
      id: "root",
      lexemeIds: { fire: "c_aaaa_root_1" },
      lexemes: { "c_aaaa_root_1": { form: ["f"], point: [0], gloss: "fire" } },
      wordFrequencyHints: { fire: 0.7 },          // OLD shape: gloss-keyed
      wordOrigin: { fire: "seed" },
    } as unknown as Parameters<typeof migrateSatelliteMaps>[0] & Record<string, Record<string, unknown>>;
    migrateSatelliteMaps(lang);
    expect(lang.wordFrequencyHints["c_aaaa_root_1"]).toBe(0.7);
    expect(lang.wordFrequencyHints["fire"]).toBeUndefined();
    expect(lang.wordOrigin["c_aaaa_root_1"]).toBe("seed");
    // idempotent: running again leaves it id-keyed
    migrateSatelliteMaps(lang);
    expect(lang.wordFrequencyHints["c_aaaa_root_1"]).toBe(0.7);
  });
});
