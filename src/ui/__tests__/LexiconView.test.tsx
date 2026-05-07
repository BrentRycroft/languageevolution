import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { LexiconView } from "../LexiconView";
import { useSimStore } from "../../state/store";

describe("LexiconView", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().reset();
  });

  it("renders rows for every seed meaning", () => {
    const { container } = render(<LexiconView />);
    const meaningCells = container.querySelectorAll("td.meaning");
    const labels = Array.from(meaningCells).map((n) =>
      n.getAttribute("data-meaning"),
    );
    expect(labels).toContain("water");
    expect(labels).toContain("fire");
    expect(labels).toContain("mother");
  });

  it("renders the proto language as a column header", () => {
    const { container } = render(<LexiconView />);
    const headers = container.querySelectorAll("th");
    expect(
      Array.from(headers).some((h) => h.textContent?.includes("Proto")),
    ).toBe(true);
  });

  it("still renders meaning column after stepping the sim", () => {
    const { container } = render(<LexiconView />);
    const store = useSimStore.getState();
    for (let i = 0; i < 5; i++) store.step();
    const meaningCells = container.querySelectorAll("td.meaning");
    expect(meaningCells.length).toBeGreaterThan(0);
  });
});
