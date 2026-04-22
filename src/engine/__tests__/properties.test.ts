import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";
import { leafIds } from "../tree/split";
import { applyChangesToWord } from "../phonology/apply";
import { CATALOG_BY_ID } from "../phonology/catalog";
import { makeRng } from "../rng";

function stringifyLeafLexicons(tree: ReturnType<ReturnType<typeof createSimulation>["getState"]>["tree"]) {
  return Object.keys(tree)
    .filter((id) => tree[id]!.childrenIds.length === 0)
    .sort()
    .map((id) => {
      const lex = tree[id]!.language.lexicon;
      return Object.keys(lex)
        .sort()
        .map((m) => `${m}=${lex[m]!.join("")}`)
        .join(",");
    })
    .join("|");
}

describe("engine property tests", () => {
  it("same seed + same generations ⇒ identical lexicons (determinism)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 12 }),
        fc.integer({ min: 10, max: 80 }),
        (seed, gens) => {
          const cfg = { ...defaultConfig(), seed };
          const a = createSimulation(cfg);
          const b = createSimulation(cfg);
          for (let i = 0; i < gens; i++) {
            a.step();
            b.step();
          }
          expect(stringifyLeafLexicons(a.getState().tree)).toBe(
            stringifyLeafLexicons(b.getState().tree),
          );
        },
      ),
      { numRuns: 12 },
    );
  });

  it("generation counter is monotonic after N steps", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 5, max: 60 }),
        (seed, gens) => {
          const sim = createSimulation({ ...defaultConfig(), seed });
          let last = -1;
          for (let i = 0; i < gens; i++) {
            sim.step();
            const g = sim.getState().generation;
            expect(g).toBeGreaterThan(last);
            last = g;
          }
        },
      ),
      { numRuns: 10 },
    );
  });

  it("tree never shrinks (nodes are never removed, only added)", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        fc.integer({ min: 50, max: 200 }),
        (seed, gens) => {
          const sim = createSimulation({ ...defaultConfig(), seed });
          let last = 1;
          for (let i = 0; i < gens; i++) {
            sim.step();
            const size = Object.keys(sim.getState().tree).length;
            expect(size).toBeGreaterThanOrEqual(last);
            last = size;
          }
        },
      ),
      { numRuns: 8 },
    );
  });

  it("at least one alive leaf remains through long runs", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 8 }),
        (seed) => {
          const sim = createSimulation({ ...defaultConfig(), seed });
          for (let i = 0; i < 500; i++) sim.step();
          const tree = sim.getState().tree;
          const alive = leafIds(tree).filter((id) => !tree[id]!.language.extinct);
          expect(alive.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 5 },
    );
  });

  it("applyChangesToWord with probability≈0 leaves the form unchanged", () => {
    const rule = CATALOG_BY_ID["lenition.p_to_f"]!;
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("p", "a", "t", "i", "k", "e"), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 1000 }),
        (form, seed) => {
          const rng = makeRng(seed);
          const out = applyChangesToWord(form, [rule], rng, {
            globalRate: 0,
            weights: { [rule.id]: 0 },
          });
          expect(out.join("")).toBe(form.join(""));
        },
      ),
      { numRuns: 30 },
    );
  });
});
