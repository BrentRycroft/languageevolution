import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { LexiconView } from "../LexiconView";
import { useSimStore } from "../../state/store";
import { lexHas, lexKeys } from "../../engine/lexicon/access";

/**
 * lexicon_badges.test.tsx
 *
 * Test suite for: "Phase 68b T6 — LexiconView badges for Phase 64/66 fields".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

function pickKnownMeaning(): string {
  const store = useSimStore.getState();
  const state = store.state;
  const root = state.tree[state.rootId];
  if (!root) return "water";
  // Pick a GLOSS seeded by the default preset's lexicon (via the seam, since
  // the canonical store is LexemeId-keyed post R2 flip).
  for (const candidate of ["water", "father", "see", "fire", "tree"]) {
    if (lexHas(root.language, candidate)) return candidate;
  }
  // Fallback: any meaning (gloss).
  return lexKeys(root.language)[0] ?? "water";
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
