import { describe, it, expect } from "vitest";
import {
  recordForm, setRecordForm, formViewOf, seededFormViewOf, mergeFormsIntoStore,
} from "../lexicon/store";
import type { LexemeStore } from "../primitives";

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
