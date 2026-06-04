import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";

/**
 * MEGA-overhaul (meaning model = continuous space): the DictionaryView now surfaces the
 * embedding. Selecting a word reveals its nearest neighbours in the language's own
 * lexicon (cosine over the shipped distributional embedding) and its readout-axis profile
 * — proving the new encoding is wired through to the UI, not just sitting in the engine.
 */
describe("DictionaryView — semantic profile", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().reset();
  });

  it("reveals nearest words + axis profile when a word row is clicked", () => {
    render(<DictionaryView />);
    // No profile until a word is selected.
    expect(screen.queryByText(/semantic profile/i)).toBeNull();

    fireEvent.click(screen.getAllByText("water")[0]!);

    expect(screen.getByText(/semantic profile/i)).toBeTruthy();
    expect(screen.getByText(/nearest words in/i)).toBeTruthy();
    expect(screen.getByText(/semantic axes/i)).toBeTruthy();
    // The six named readout axes render as labelled bars.
    for (const axis of ["valence", "size", "temperature", "brightness", "strength", "distance"]) {
      expect(screen.getByText(axis)).toBeTruthy();
    }
  });
});
