import { describe, it, expect } from "vitest";
import { parseSentenceResponse } from "../translator/translate";

describe("parseSentenceResponse", () => {
  it("parses a well-formed response", () => {
    const raw = `{"target":"pətra ka maθer","tokens":[{"form":"pətra","gloss":"dog"},{"form":"ka","gloss":"sees"},{"form":"maθer","gloss":"mother"}],"missing":[],"notes":"SVO preserved"}`;
    const out = parseSentenceResponse(raw);
    expect(out.target).toBe("pətra ka maθer");
    expect(out.tokens.length).toBe(3);
    expect(out.tokens[0]).toEqual({ form: "pətra", gloss: "dog" });
    expect(out.missing).toEqual([]);
    expect(out.notes).toBe("SVO preserved");
  });

  it("accepts a prose-wrapped response", () => {
    const raw = `Sure — here is the translation:
{"target":"wa","tokens":[{"form":"wa","gloss":"water"}],"missing":["sky"],"notes":"sky missing"}
Hope this helps.`;
    const out = parseSentenceResponse(raw);
    expect(out.target).toBe("wa");
    expect(out.missing).toEqual(["sky"]);
  });

  it("returns a fallback shape when no JSON is present", () => {
    const out = parseSentenceResponse("I couldn't translate that sentence.");
    expect(out.target).toBe("");
    expect(out.tokens).toEqual([]);
    expect(out.missing).toEqual([]);
    expect(out.notes).toContain("AI");
  });

  it("discards malformed tokens gracefully", () => {
    const raw = `{"target":"x y","tokens":[{"form":"x","gloss":"a"},42,{"form":"y"}],"missing":null,"notes":null}`;
    const out = parseSentenceResponse(raw);
    expect(out.tokens.map((t) => t.form)).toEqual(["x", "y"]);
    expect(out.missing).toEqual([]);
  });
});
