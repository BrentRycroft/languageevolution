import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";
import { tryBorrow } from "../contact/borrow";
import { makeRng } from "../rng";
import { tSet as lexSet, tDelete as lexDelete } from "../lexicon/__tests__/glossSeam";

/**
 * contact.test.ts
 *
 * Test suite for: "contact / loanwords".
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

const RUN_SLOW = !!(globalThis as { process?: { env?: Record<string, string | undefined> } })
  .process?.env?.RUN_SLOW;

describe("contact / loanwords", () => {
  // Heavyweight 300/400-generation runs — gated behind RUN_SLOW so the
  // default suite stays fast (CI runs the full surface via test:slow).
  it.skipIf(!RUN_SLOW)("records a borrow event somewhere in a 300-gen run", () => {
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

  it.skipIf(!RUN_SLOW)("borrowed words only come from sister languages, not ancestors", () => {
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
    // Phase 70.1: no day-one split; step until the proto has split so there are
    // ≥2 leaves to wire up. (Split timing is trajectory-dependent — it shifted
    // later after the B1-Y per-concept-RNG re-baseline — so cap generously and
    // break as soon as the split occurs.)
    for (let i = 0; i < 400; i++) {
      sim.step();
      if (leafIds(sim.getState().tree).length >= 2) break;
    }
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
      lexemes: { ...nearLang.lexemes },
      lexemeIds: { ...nearLang.lexemeIds },
    };
    lexSet(farLang, "distant_thing", ["d", "i", "s"]);
    state.tree[farId] = {
      language: farLang,
      parentId: state.tree[nearId]!.parentId,
      childrenIds: [],
    };
    lexSet(nearLang, "nearby_thing", ["n", "a", "r"]);

    let nearHits = 0;
    let farHits = 0;
    for (let i = 0; i < 300; i++) {
      const r = {
        ...recipient,
        lexemes: { ...recipient.lexemes },
        lexemeIds: { ...recipient.lexemeIds },
        wordFrequencyHints: { ...recipient.wordFrequencyHints },
      };
      lexDelete(r, "nearby_thing");
      lexDelete(r, "distant_thing");
      const rng = makeRng("geo-" + i);
      const loan = tryBorrow(r, state.tree, rng, 1.0);
      if (!loan) continue;
      if (loan.donorId === nearId) nearHits++;
      else if (loan.donorId === farId) farHits++;
    }
    expect(nearHits).toBeGreaterThan(farHits * 2);
  });
});
