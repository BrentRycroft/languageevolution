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
    // With default contact rate 0.02, ~300 gens, multiple leaves, at least one
    // borrow should have fired by now.
    expect(borrowEvents.length).toBeGreaterThan(0);
  });

  it("borrowed words only come from sister languages, not ancestors", () => {
    // Run long enough that borrows happen and verify semantic well-formedness.
    const cfg = { ...defaultConfig(), seed: "sister-only" };
    const sim = createSimulation(cfg);
    for (let i = 0; i < 400; i++) sim.step();
    const leaves = leafIds(sim.getState().tree).filter(
      (id) => !sim.getState().tree[id]!.language.extinct,
    );
    expect(leaves.length).toBeGreaterThan(0);
  });

  it("prefers spatially-close donors over distant ones", () => {
    // Build a contrived state with one recipient and two candidate donors,
    // one nearby and one far. Run tryBorrow at p=1.0 many times with
    // different RNG seeds and check the nearby donor wins more often.
    const cfg = { ...defaultConfig(), seed: "geo-bias" };
    const sim = createSimulation(cfg);
    // Step once so the proto splits into daughters. The bootstrap
    // distribution is now multi-way (2–8), so the returned tree may
    // have more than two leaves. We keep only two of them alive for
    // the near-vs-far competition and mark the rest extinct so they
    // don't dilute the donor pool.
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
    // Seed coords deliberately: recipient at origin, near 10 away, far 500 away.
    recipient.coords = { x: 0, y: 0 };
    nearLang.coords = { x: 10, y: 0 };
    // Fabricate a distant sibling by cloning near into a new tree slot.
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
    // Make both donors distinguishable by giving them a unique meaning
    // that the recipient lacks.
    nearLang.lexicon.nearby_thing = ["n", "a", "r"];

    let nearHits = 0;
    let farHits = 0;
    for (let i = 0; i < 300; i++) {
      // Fresh recipient lex each trial so we keep both meanings as targets.
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
    // At d=10 affinity ≈ 0.95; at d=500 affinity ≈ 0.29. The near donor
    // should be chosen at least 2× as often.
    expect(nearHits).toBeGreaterThan(farHits * 2);
  });
});
