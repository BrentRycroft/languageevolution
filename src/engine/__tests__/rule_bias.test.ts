import { describe, it, expect } from "vitest";
import { parseBias } from "../translator/ruleBias";
import { DEFAULT_RULE_BIAS } from "../phonology/propose";

describe("parseBias", () => {
  it("accepts a fully-populated object", () => {
    const raw = `{"lenition":1.5,"fortition":0.8,"place_assim":1,"palatalization":1,"vowel_shift":1.2,"vowel_reduction":1,"harmony":1,"deletion":1,"metathesis":1,"tone":0.5}`;
    const bias = parseBias(raw);
    expect(bias).not.toBeNull();
    if (!bias) return;
    expect(bias.lenition).toBeCloseTo(1.5, 2);
    expect(bias.fortition).toBeCloseTo(0.8, 2);
    expect(bias.tone).toBeCloseTo(0.5, 2);
  });

  it("fills in defaults for unspecified families", () => {
    const raw = `{"lenition":2.0}`;
    const bias = parseBias(raw);
    if (!bias) throw new Error("expected bias");
    expect(bias.lenition).toBeCloseTo(2.0, 2);
    expect(bias.fortition).toBe(DEFAULT_RULE_BIAS.fortition);
    expect(bias.harmony).toBe(DEFAULT_RULE_BIAS.harmony);
  });

  it("clamps out-of-range values to [0.2, 2.5]", () => {
    const raw = `{"lenition":10,"fortition":-1,"harmony":0.0}`;
    const bias = parseBias(raw);
    if (!bias) throw new Error("expected bias");
    expect(bias.lenition).toBe(2.5);
    expect(bias.fortition).toBe(0.2);
    expect(bias.harmony).toBe(0.2);
  });

  it("accepts prose-wrapped JSON", () => {
    const raw = `Sure, here's the vector:\n{"lenition":1.3,"vowel_shift":1.1}`;
    const bias = parseBias(raw);
    expect(bias?.lenition).toBeCloseTo(1.3, 2);
  });

  it("returns null on malformed input", () => {
    expect(parseBias("not json")).toBeNull();
    expect(parseBias("{missing brackets")).toBeNull();
  });

  it("rejects non-number values (null, boolean, string)", () => {
    expect(parseBias(`{"lenition": null}`)).toBeNull();
    expect(parseBias(`{"lenition": true, "fortition": false}`)).toBeNull();
    expect(parseBias(`{"lenition": "1.5"}`)).toBeNull();
  });

  it("ignores unknown keys but still validates", () => {
    const raw = `{"foo":9,"lenition":1.4,"bar":2}`;
    const bias = parseBias(raw);
    expect(bias?.lenition).toBeCloseTo(1.4, 2);
    expect("foo" in (bias ?? {})).toBe(false);
  });
});
