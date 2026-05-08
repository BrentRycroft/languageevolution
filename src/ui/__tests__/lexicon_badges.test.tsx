import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LexiconView } from "../LexiconView";
import { useSimStore } from "../../state/store";

function pickKnownMeaning(): string {
  const store = useSimStore.getState();
  const state = store.state;
  const root = state.tree[state.rootId];
  const lex = root?.language?.lexicon ?? {};
  // Pick a meaning that's seeded by the default preset's lexicon.
  for (const candidate of ["water", "father", "see", "fire", "tree"]) {
    if (lex[candidate]) return candidate;
  }
  // Fallback: any meaning.
  return Object.keys(lex)[0] ?? "water";
}

function setNounClass(meaning: string, cls: 1 | 2 | 3 | 4 | 5) {
  const store = useSimStore.getState();
  const state = store.state;
  const proto = state.tree[state.rootId]?.language;
  if (!proto) return;
  proto.nounDeclensionClass = {
    ...(proto.nounDeclensionClass ?? {}),
    [meaning]: cls,
  };
  // Trigger re-render via shallow-clone setState.
  useSimStore.setState({ state: { ...state, tree: { ...state.tree } } });
}

describe("Phase 68b T6 — LexiconView badges for Phase 64/66 fields", () => {
  beforeEach(() => {
    cleanup();
    useSimStore.getState().reset();
  });

  it("renders a D{class} badge for nouns with nounDeclensionClass", () => {
    const m = pickKnownMeaning();
    setNounClass(m, 3);
    render(<LexiconView />);
    const badges = screen.queryAllByTestId(`decl-badge-${m}`);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges[0]!.textContent).toBe("D3");
  });
});
