import { describe, it, expect } from "vitest";
import { csvEscape, toCsv, slugForFile } from "../exportUtils";

describe("csvEscape", () => {
  it("returns plain values unchanged when they have no special chars", () => {
    expect(csvEscape("hello")).toBe("hello");
    expect(csvEscape(42)).toBe("42");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("returns empty string for null and undefined", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("toCsv", () => {
  it("produces a header + body CSV", () => {
    const out = toCsv(["a", "b"], [["1", "2"], ["3", "4"]]);
    expect(out).toBe("a,b\n1,2\n3,4\n");
  });

  it("escapes special chars in cells", () => {
    const out = toCsv(["x", "y"], [["a,b", 'c"d']]);
    expect(out).toBe('x,y\n"a,b","c""d"\n');
  });

  it("handles an empty rowset", () => {
    expect(toCsv(["a"], [])).toBe("a\n");
  });
});

describe("slugForFile", () => {
  it("lowercases and replaces non-alphanumerics with dashes", () => {
    expect(slugForFile("Hello World!")).toBe("hello-world");
    expect(slugForFile("foo_bar.baz")).toBe("foo_bar-baz");
  });

  it("strips leading and trailing dashes", () => {
    expect(slugForFile("---hi---")).toBe("hi");
  });

  it("falls back to 'untitled' for empty input", () => {
    expect(slugForFile("")).toBe("untitled");
    expect(slugForFile("---")).toBe("untitled");
  });

  it("caps length at 60 characters", () => {
    const long = "a".repeat(100);
    expect(slugForFile(long).length).toBe(60);
  });
});
