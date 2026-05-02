import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useSimStore } from "../../state/store";
import { WordMapView } from "../WordMapView";
import { addWord } from "../../engine/lexicon/word";

describe("Phase 21e — WordMapView", () => {
  beforeEach(() => {
    useSimStore.getState().reset();
  });

  it("renders without throwing for a fresh language", () => {
    expect(() => render(<WordMapView />)).not.toThrow();
  });

  it("shows the words count and surfaces a polysemy entry", () => {
    // Plant a homonym on the root language.
    const { state } = useSimStore.getState();
    const lang = state.tree[state.rootId]!.language;
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.financial", { bornGeneration: 0 });
    addWord(lang, ["b", "æ", "ŋ", "k"], "bank.river", { bornGeneration: 0 });
    useSimStore.setState({ state: { ...state } });

    render(<WordMapView />);
    // The polysemous form's two senses both appear in the table.
    const finCells = screen.getAllByText(/bank\.financial/);
    const rivCells = screen.getAllByText(/bank\.river/);
    expect(finCells.length).toBeGreaterThan(0);
    expect(rivCells.length).toBeGreaterThan(0);
  });

  it("offers the homonyms-only filter for narrowing to ≥2-sense words", () => {
    render(<WordMapView />);
    // The filter dropdown contains "homonyms only".
    expect(screen.getByText(/homonyms only/i)).toBeDefined();
  });
});
