import { describe, expect, test } from "vitest";
import { reduplicate } from "../morphology/reduplication";

describe("reduplicate", () => {
  test("full reduplication doubles the form", () => {
    expect(reduplicate(["k", "a", "n"], "full")).toEqual(["k", "a", "n", "k", "a", "n"]);
  });

  test("partial-initial copies the leading C(C)V", () => {
    expect(reduplicate(["k", "a", "n", "o"], "partial-initial")).toEqual(["k", "a", "k", "a", "n", "o"]);
    expect(reduplicate(["t", "i"], "partial-initial")).toEqual(["t", "i", "t", "i"]);
    expect(reduplicate(["s", "t", "u", "p"], "partial-initial")).toEqual(["s", "t", "u", "s", "t", "u", "p"]);
  });

  test("partial-final copies the trailing VC", () => {
    expect(reduplicate(["k", "a", "n", "o"], "partial-final")).toEqual(["k", "a", "n", "o", "o"]);
    expect(reduplicate(["t", "i"], "partial-final")).toEqual(["t", "i", "i"]);
  });

  test("vowel-initial form leaves first vowel as the prepended unit", () => {
    expect(reduplicate(["a", "n", "o"], "partial-initial")).toEqual(["a", "a", "n", "o"]);
  });

  test("empty form returns unchanged", () => {
    expect(reduplicate([], "partial-initial")).toEqual([]);
    expect(reduplicate([], "full")).toEqual([]);
  });

  test("all-consonant form (no vowels) returns unchanged for partial modes", () => {
    expect(reduplicate(["s", "t", "k"], "partial-initial")).toEqual(["s", "t", "k"]);
    expect(reduplicate(["s", "t", "k"], "partial-final")).toEqual(["s", "t", "k"]);
  });
});
