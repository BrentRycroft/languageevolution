import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { GrammarView } from "../GrammarView";
import { useSimStore } from "../../state/store";

describe("GrammarView", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().reset();
  });

  it("shows the default grammar features of the proto language", () => {
    render(<GrammarView />);
    expect(screen.getByText("word order")).toBeTruthy();
    expect(screen.getByText("SOV")).toBeTruthy();
    expect(screen.getByText("affix position")).toBeTruthy();
    expect(screen.getByText("suffix")).toBeTruthy();
  });

  it("prompts when no language is selected", () => {
    useSimStore.getState().selectLanguage(null);
    render(<GrammarView />);
    expect(screen.getByText(/Select a language/i)).toBeTruthy();
  });
});
