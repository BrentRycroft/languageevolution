import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";
import { tryBorrow } from "../contact/borrow";
import { makeRng } from "../rng";

describe("contact / loanwords", () => {
  it("records a borrow event somewhere in a 300-gen run", () => {
    const cfg = { ...defaultConfig(), seed: "contact-test" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 300; i++) sim.step();
    const tree = sim.getState().tree;
    const borrowEvents: string[] = [];
    for (const id of Object.keys(tree)) {
      for (const e of tree[id]!.language.events) {
        if (e.kind === "borrow") borrowEvents.push(e.description);
      }
    }
    expect(borrowEvents.length).toBeGreaterThan(0);
  });

  it("borrowed words only come from sister languages, not ancestors", () => {
    const cfg = { ...defaultConfig(), seed: "sister-only" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 400; i++) sim.step();
    const leaves = leafIds(sim.getState().tree).filter(
      (id) => !sim.getState().tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
  });

  it("prefers spatially-close donors over distant ones", () => {
    const cfg = { ...defaultConfig(), seed: "geo-bias" };
    const sim = createSimulation(cfg);
    sim.step();
    const state = sim.getState();
    const leaves = leafIds(state.tree);
    expect(leaves.length).toBeGreaterThanOrEqual(2);
    const recipientId = leaves[0]!;
    const nearId = leaves[1]!;
    for (let k = 2; k < leaves.length; k++) {
      state.tree[leaves[k]!]!.language.extinct = true;
    }
    const recipient = state.tree[recipientId]!.language;
    const nearLang = state.tree[nearId]!.language;
    recipient.coords = { x: 0, y: 0 };
    nearLang.coords = { x: 10, y: 0 };
    const farId = "L-far";
    const farLang = {
      ...nearLang,
      id: farId,
      name: "Far",
      coords: { x: 500, y: 0 },
      lexicon: { ...nearLang.lexicon, distant_thing: ["d", "i", "s"] },
    };
    state.tree[farId] = {
      language: farLang,
      parentId: state.tree[nearId]!.parentId,
      childrenIds: [],
    };
    nearLang.lexicon.nearby_thing = ["n", "a", "r"];

    let nearHits = 0;
    let farHits = 0;
    for (let i = 0; i < 300; i++) {
      const r = {
        ...recipient,
        lexicon: { ...recipient.lexicon },
        wordFrequencyHints: { ...recipient.wordFrequencyHints },
      };
      delete r.lexicon.nearby_thing;
      delete r.lexicon.distant_thing;
      const rng = makeRng("geo-" + i);
      const loan = tryBorrow(r, state.tree, rng, 1.0);
      if (!loan) continue;
      if (loan.donorId === nearId) nearHits++;
      else if (loan.donorId === farId) farHits++;
    }
    expect(nearHits).toBeGreaterThan(farHits * 2);
  });
});
