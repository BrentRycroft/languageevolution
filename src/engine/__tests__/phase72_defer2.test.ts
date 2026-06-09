import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { deleteMeaning } from "../lexicon/mutate";
import {
  lexemeIdFor,
  meaningForLexemeId,
  ensureLexemeIdsForLexicon,
  mintLexemeId,
} from "../lexicon/lexemeIdentity";
import { setLexiconForm } from "../lexicon/mutate";
import { tGlosses as lexKeys } from "../lexicon/__tests__/glossSeam";

/**
 * phase72_defer2.test.ts — Phase 72 deferred item defer-2:
 * stable LexemeId UUIDs for meanings + UUID-anchored meaningHistory.
 */

describe("Defer-2 (T72d) — concept UUID anchors", () => {
  it("buildInitialState assigns LexemeIds to every meaning in proto lexicon", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-init";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lang.lexemeIds).toBeDefined();
    // Every meaning (gloss) in the lexicon should have an ID.
    for (const m of lexKeys(lang)) {
      expect(lang.lexemeIds![m]).toBeDefined();
      // Format: c_<8-hex>_<langId>_<seq>. Proto meanings are minted on
      // the root language (id "L-0").
      expect(lang.lexemeIds![m]).toMatch(/^c_[0-9a-f]{8}_L-\d+_\d+$/);
    }
  });

  it("two sims with the same config produce identical lexemeIds (determinism)", () => {
    // Regression for the pre-fix module-global counter: two sims built
    // and stepped in the SAME process used to get different LexemeIds
    // for the same meaning (the counter advanced across both). With the
    // per-language deterministic mint they must match exactly.
    const make = () => {
      const cfg = presetRomance();
      cfg.seed = "p72-defer2-determinism";
      return createSimulation(cfg);
    };
    const a = make();
    const b = make();
    for (let i = 0; i < 20; i++) {
      a.step();
      b.step();
    }
    const collect = (sim: ReturnType<typeof createSimulation>) => {
      const out: Record<string, Record<string, string>> = {};
      for (const [id, node] of Object.entries(sim.getState().tree)) {
        out[id] = { ...(node.language.lexemeIds ?? {}) };
      }
      return out;
    };
    expect(collect(a)).toEqual(collect(b));
  });

  it("lexemeIdFor returns the same ID on repeat calls (idempotent)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-idem";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const a = lexemeIdFor(lang, "water");
    const b = lexemeIdFor(lang, "water");
    expect(a).toBe(b);
  });

  it("daughters inherit the parent's lexemeIds at split (cross-tree anchor)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-inherit";
    cfg.historical = { scheduleId: "romance", intensity: 1.0 };
    const sim = createSimulation(cfg);
    const proto = sim.getState().tree["L-0"]!.language;
    const protoTailId = proto.lexemeIds?.tail;
    // Run through the M2 split.
    for (let i = 0; i < 70; i++) sim.step();
    const leaves = Object.values(sim.getState().tree)
      .filter((n) => n.childrenIds.length === 0)
      .map((n) => n.language)
      .filter((l) => !l.extinct && l.id !== proto.id);
    let foundMatch = false;
    for (const lang of leaves) {
      if (lang.lexemeIds?.tail === protoTailId) {
        foundMatch = true;
        break;
      }
    }
    // At least one daughter should still carry the proto UUID for "tail"
    // (assuming the meaning hasn't been recarved away in that lineage).
    if (protoTailId) {
      expect(foundMatch).toBe(true);
    }
  });

  it("deleteMeaning records BOTH conceptId and mergedIntoLexemeId in history", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-delete";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    const tailId = lang.lexemeIds!.tail;
    const backId = lang.lexemeIds!.back;
    expect(tailId).toBeDefined();
    expect(backId).toBeDefined();

    deleteMeaning(lang, "tail", {
      mergedInto: "back",
      generation: 1,
      reason: "test-merger",
    });

    expect(lang.meaningHistory!.tail).toBeDefined();
    expect(lang.meaningHistory!.tail.conceptId).toBe(tailId);
    expect(lang.meaningHistory!.tail.mergedIntoLexemeId).toBe(backId);
    expect(lang.meaningHistory!.tail.mergedInto).toBe("back");
  });

  it("setLexiconForm lazy-mints UUIDs for newly-coined meanings", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-coin";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;

    const newMeaning = "newly-coined-test-meaning";
    expect(lang.lexemeIds?.[newMeaning]).toBeUndefined();
    setLexiconForm(lang, newMeaning, ["x", "y", "z"], { bornGeneration: 5 });
    expect(lang.lexemeIds![newMeaning]).toBeDefined();
    expect(lang.lexemeIds![newMeaning]).toMatch(/^c_/);
  });

  it("meaningForLexemeId reverse-lookup finds the bound meaning", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-reverse";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const tailId = lang.lexemeIds!.tail as any;
    expect(meaningForLexemeId(lang, tailId)).toBe("tail");
    expect(meaningForLexemeId(lang, "non-existent" as any)).toBeUndefined();
  });

  it("mintLexemeId produces unique values", () => {
    const lang = { id: "L-test", conceptIdSeq: 0 };
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(mintLexemeId(lang));
    }
    expect(ids.size).toBe(100);
  });

  it("ensureLexemeIdsForLexicon is idempotent (no double-mint)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72-defer2-idem-bulk";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const before = { ...lang.lexemeIds };
    const assigned = ensureLexemeIdsForLexicon(lang);
    expect(assigned).toBe(0); // every meaning already has an ID
    for (const m of Object.keys(before)) {
      expect(lang.lexemeIds![m]).toBe(before[m]);
    }
  });
});
