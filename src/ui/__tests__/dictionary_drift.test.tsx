import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";
import { lexPoint } from "../../engine/semantics/meaningPoint";

describe("DictionaryView — drifted meanings", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
    const s = useSimStore.getState();
    const lang = s.state.tree[s.state.rootId]!.language;
    lang.meaningPoints = { water: Array.from(lexPoint("fire")) };
  });
  it("flags a glided meaning with a 'drifted' badge", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("water")[0]!);
    expect(screen.getByText(/drifted/i)).toBeTruthy();
  });
  it("shows no 'drifted' badge for a meaning that hasn't glided (fire)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("fire")[0]!);
    expect(screen.queryByText(/drifted/i)).toBeNull();
  });
});
