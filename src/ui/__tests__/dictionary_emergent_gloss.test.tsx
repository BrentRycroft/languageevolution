import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";
import { findPrimaryWordForMeaning } from "../../engine/lexicon/word";
import { fromFloats } from "../../engine/semantics/vec";
import { embed } from "../../engine/semantics/embeddings";

describe("DictionaryView — emergent gloss + drift labelling", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
  });

  it("shows no drift marker for 'water' which resolves to its own anchor at seed", () => {
    render(<DictionaryView />);
    // "water" seeded at its own anchor: emergent gloss == authored meaning, no drift label
    const waterCells = screen.getAllByText("water");
    expect(waterCells.length).toBeGreaterThan(0);
    // There should be no drift marker citing "water" as the seeded-as meaning
    expect(screen.queryByText(/seeded:\s*water/i)).toBeNull();
  });

  it("shows emergent gloss and a drift marker when a sense's point is moved into another anchor's region", () => {
    // Mutate the language directly: glide "water"'s primary sense point to sit at "fire"'s anchor.
    const s = useSimStore.getState();
    const lang = s.state.tree[s.state.rootId]!.language;
    const waterWord = findPrimaryWordForMeaning(lang, "water")!;
    expect(waterWord).toBeTruthy();
    const primarySense = waterWord.senses[waterWord.primarySenseIndex]!;
    // Place the sense at fire's exact embedding — it will now resolve to "fire" as emergent gloss.
    primarySense.point = Array.from(fromFloats(embed("fire")));

    render(<DictionaryView />);

    // The drift marker should cite "water" as the authored (seeded) meaning
    expect(screen.getByText(/seeded:\s*water/i)).toBeTruthy();
    // The emergent gloss "fire" should appear somewhere in the table cell
    const nowFireMatches = screen.getAllByText(/now:\s*fire/i);
    expect(nowFireMatches.length).toBeGreaterThan(0);
  });
});
