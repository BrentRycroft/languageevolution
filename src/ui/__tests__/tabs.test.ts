import { describe, it, expect } from "vitest";
import { TABS } from "../tabs";

describe("TABS — single source of truth for tab bar + keyboard shortcuts", () => {
  it("contains 12 tabs", () => {
    expect(TABS).toHaveLength(12);
  });

  it("each tab has a unique id", () => {
    const ids = new Set(TABS.map((t) => t.id));
    expect(ids.size).toBe(TABS.length);
  });

  it("each tab has a label and title", () => {
    for (const t of TABS) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.title.length).toBeGreaterThan(0);
    }
  });

  it("first 9 tabs match what 1-9 keyboard shortcuts will jump to", () => {
    const expected = [
      "tree",
      "map",
      "dictionary",
      "timeline",
      "grammar",
      "phonemes",
      "laws",
      "events",
      "translate",
    ];
    expect(TABS.slice(0, 9).map((t) => t.id)).toEqual(expected);
  });

  it("phonemes is shortcut 6 (was misaligned in pre-19b-2 builds)", () => {
    expect(TABS[5]?.id).toBe("phonemes");
  });

  it("laws is shortcut 7 (was unreachable via keyboard pre-19b-2)", () => {
    expect(TABS[6]?.id).toBe("laws");
  });

  it("compare/stats/glossary need 10/11/12 (overflow from number row)", () => {
    expect(TABS[9]?.id).toBe("compare");
    expect(TABS[10]?.id).toBe("stats");
    expect(TABS[11]?.id).toBe("glossary");
  });
});
