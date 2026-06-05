import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetTokipona } from "../../engine/presets/tokipona";

/**
 * Track C plan 0: the Dictionary's "morphemes" row shows the ACTIVE language's composition.
 * Toki Pona "computer" = work + know — the row must list those parts (not the English baked set,
 * which has no decomposition for Toki Pona "computer").
 */
describe("DictionaryView — per-language morpheme composition", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetTokipona());
  });

  it("shows Toki Pona computer = work + know", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("computer")[0]!);
    expect(screen.getByText("morphemes")).toBeTruthy();
    expect(screen.getAllByText("work").length).toBeGreaterThan(0);
    expect(screen.getAllByText("know").length).toBeGreaterThan(0);
  });
});
