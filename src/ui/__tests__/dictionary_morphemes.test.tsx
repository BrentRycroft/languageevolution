import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";

describe("DictionaryView — morpheme composition", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
  });
  it("shows the morpheme composition for a decomposed word (behind = hind + be-)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("behind")[0]!);
    expect(screen.getByText(/morphemes/i)).toBeTruthy();
    expect(screen.getAllByText("hind").length).toBeGreaterThan(0);
  });
  it("shows no morpheme row for a non-decomposed word (water)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("water")[0]!);
    expect(screen.queryByText(/morphemes/i)).toBeNull();
  });
});
