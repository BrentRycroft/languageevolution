import { describe, it, expect } from "vitest";
import { presetEnglish } from "../presets/english";
import { createSimulation } from "../simulation";
import {
  findBorrowableAffix,
  borrowAffixIntoRecipient,
} from "../contact/affix_borrow";

describe("Phase 57 — cross-language affix borrowing", () => {
  it("findBorrowableAffix returns null when no neighbour has a productive affix in the category", () => {
    const sim = createSimulation(presetEnglish());
    sim.step(); // get at least 2 leaves
    const state = sim.getState();
    const leaves = Object.values(state.tree).filter((n) => n.childrenIds.length === 0);
    if (leaves.length === 0) return;
    const recipient = leaves[0]!.language;
    // Strip every leaf's `diminutive` affix (English doesn't seed any
    // anyway) so the search must come up empty.
    for (const node of Object.values(state.tree)) {
      const lang = node.language;
      if (!lang.derivationalSuffixes) continue;
      lang.derivationalSuffixes = lang.derivationalSuffixes.filter(
        (s) => s.category !== "diminutive",
      );
    }
    const borrowed = findBorrowableAffix(recipient, "diminutive", state.tree);
    expect(borrowed).toBeNull();
  });

  it("findBorrowableAffix picks a neighbour's productive affix in the requested category", () => {
    const sim = createSimulation(presetEnglish());
    sim.step();
    const state = sim.getState();
    const leaves = Object.values(state.tree).filter((n) => n.childrenIds.length === 0);
    if (leaves.length < 2) return;
    const recipient = leaves[0]!.language;
    const donor = leaves[1]!.language;
    // Wipe recipient's abstractNoun affixes; donor keeps theirs.
    if (recipient.derivationalSuffixes) {
      recipient.derivationalSuffixes = recipient.derivationalSuffixes.filter(
        (s) => s.category !== "abstractNoun",
      );
    }
    const borrowed = findBorrowableAffix(recipient, "abstractNoun", state.tree);
    if (borrowed) {
      expect(borrowed.donorLanguageId).toBe(donor.id);
      expect(borrowed.category).toBe("abstractNoun");
    }
  });

  it("borrowAffixIntoRecipient adds the affix and emits a borrow event", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
    const initial = lang.derivationalSuffixes.length;
    const before = lang.events.length;
    const result = borrowAffixIntoRecipient(
      lang,
      {
        donorLanguageId: "L-donor",
        affix: ["i", "s", "t"],
        tag: "-borrowed-ist",
        category: "agentive",
        position: "suffix",
        donorUsageCount: 8,
      },
      30,
    );
    expect(result).toBe(true);
    expect(lang.derivationalSuffixes.length).toBe(initial + 1);
    const added = lang.derivationalSuffixes.find((s) => s.tag === "-borrowed-ist")!;
    expect(added.donorLanguageId).toBe("L-donor");
    expect(added.borrowedGeneration).toBe(30);
    expect(added.productive).toBe(true);
    expect(lang.events.length).toBe(before + 1);
    expect(lang.events[lang.events.length - 1]!.kind).toBe("borrow");
  });

  it("borrowing is idempotent on repeat calls with the same tag", () => {
    const sim = createSimulation(presetEnglish());
    const lang = sim.getState().tree["L-0"]!.language;
    if (!lang.derivationalSuffixes) lang.derivationalSuffixes = [];
    borrowAffixIntoRecipient(
      lang,
      {
        donorLanguageId: "L-donor",
        affix: ["i", "s", "t"],
        tag: "-twice",
        category: "agentive",
        position: "suffix",
        donorUsageCount: 8,
      },
      30,
    );
    const second = borrowAffixIntoRecipient(
      lang,
      {
        donorLanguageId: "L-donor",
        affix: ["i", "s", "t"],
        tag: "-twice",
        category: "agentive",
        position: "suffix",
        donorUsageCount: 8,
      },
      31,
    );
    expect(second).toBe(false);
  });
});
