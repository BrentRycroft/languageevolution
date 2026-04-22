import { describe, it, expect } from "vitest";
import { parseRuleDsl, compileUserRule } from "../phonology/dsl";
import { makeRng } from "../rng";

describe("sound-change DSL parser", () => {
  it("parses an unconditional substitution", () => {
    const r = parseRuleDsl("p -> f");
    expect(typeof r).not.toBe("string");
    if (typeof r === "string") return;
    expect(r.from).toBe("p");
    expect(r.to).toBe("f");
    expect(r.before).toBeNull();
    expect(r.after).toBeNull();
  });

  it("parses a contextual substitution", () => {
    const r = parseRuleDsl("k -> h / _V");
    if (typeof r === "string") throw new Error(r);
    expect(r.from).toBe("k");
    expect(r.to).toBe("h");
    expect(r.before).toBeNull();
    expect(r.after).toBe("V");
  });

  it("parses the unicode arrow", () => {
    const r = parseRuleDsl("s → z / V_V");
    if (typeof r === "string") throw new Error(r);
    expect(r.before).toBe("V");
    expect(r.after).toBe("V");
  });

  it("parses a deletion rule", () => {
    const r = parseRuleDsl("V -> # / _#");
    if (typeof r === "string") throw new Error(r);
    expect(r.to).toBeNull();
    expect(r.after).toBe("#");
  });

  it("rejects malformed input", () => {
    expect(typeof parseRuleDsl("gibberish")).toBe("string");
    expect(typeof parseRuleDsl("p -> f / no underscore")).toBe("string");
  });
});

describe("compileUserRule", () => {
  it("compiled p -> f fires on a word containing p", () => {
    const parsed = parseRuleDsl("p -> f");
    if (typeof parsed === "string") throw new Error(parsed);
    const rule = compileUserRule(parsed, 999);
    const rng = makeRng("dsl");
    const out = rule.apply(["p", "a", "p"], rng);
    expect(out.some((x) => x === "f")).toBe(true);
  });

  it("compiled context rule only fires in context", () => {
    const parsed = parseRuleDsl("k -> h / _V");
    if (typeof parsed === "string") throw new Error(parsed);
    const rule = compileUserRule(parsed, 1);
    // k at end of word — no vowel after, no matches.
    expect(rule.probabilityFor(["a", "k"])).toBe(0);
    // k followed by vowel — a site should exist.
    expect(rule.probabilityFor(["k", "a"])).toBeGreaterThan(0);
  });

  it("compiled deletion rule removes the target phoneme", () => {
    const parsed = parseRuleDsl("V -> # / _#");
    if (typeof parsed === "string") throw new Error(parsed);
    const rule = compileUserRule(parsed, 999);
    const rng = makeRng("del");
    const out = rule.apply(["t", "a"], rng);
    expect(out).toEqual(["t"]);
  });
});
