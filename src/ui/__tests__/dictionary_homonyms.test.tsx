import { describe, it, expect, beforeEach } from "vitest";
import { render, cleanup, fireEvent, screen } from "@testing-library/react";
import { DictionaryView } from "../DictionaryView";
import { useSimStore } from "../../state/store";
import { presetEnglish } from "../../engine/presets/english";
import { tSet as lexSet } from "../../engine/lexicon/__tests__/glossSeam";

describe("DictionaryView — homonyms", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().loadConfig(presetEnglish());
    const s = useSimStore.getState();
    const lang = s.state.tree[s.state.rootId]!.language;
    lexSet(lang, "big", ["k", "u", "x"]);
    lexSet(lang, "small", ["k", "u", "x"]);
  });
  it("surfaces a homonym (big/small forced to share a form)", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("big")[0]!);
    expect(screen.getByText(/homonyms/i)).toBeTruthy();
    expect(screen.getAllByText("small").length).toBeGreaterThan(0);
  });
  it("a word with a unique form shows no homonyms row", () => {
    render(<DictionaryView />);
    fireEvent.click(screen.getAllByText("mother")[0]!);
    expect(screen.queryByText(/homonyms/i)).toBeNull();
  });
});
