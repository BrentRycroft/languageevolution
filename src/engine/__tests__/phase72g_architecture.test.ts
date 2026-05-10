import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetRomance } from "../presets/romance";
import { enableStratalMode, getUR, isOpaque } from "../phonology/stratal";
import { refreshContactLinks, linksFor } from "../contact/reticulate";
import { englishTokensToAST, astToTokens } from "../translator/ast";
import { tryReanalyseAlignment } from "../grammar/reanalysis";
import type { EnglishToken } from "../translator/tokens";

describe("Phase 72g-1 — stratal phonology UR/SR layer", () => {
  it("enableStratalMode snapshots lexicon into lexiconUR", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-stratal";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    expect(lang.lexiconUR).toBeUndefined();
    enableStratalMode(lang);
    expect(lang.lexiconUR).toBeDefined();
    // UR should match SR at moment of enable.
    for (const m of Object.keys(lang.lexicon)) {
      expect(lang.lexiconUR![m]).toEqual(lang.lexicon[m]);
    }
  });

  it("getUR falls back to surface when stratal mode is off", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-fallback";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    const meaning = Object.keys(lang.lexicon)[0]!;
    expect(getUR(lang, meaning)).toEqual(lang.lexicon[meaning]);
  });

  it("isOpaque detects SR drift after stratal-mode enable + sound change", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-opaque";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    enableStratalMode(lang);
    const meaning = Object.keys(lang.lexicon)[0]!;
    // Forcefully mutate the surface to simulate post-rule erosion.
    lang.lexicon[meaning] = ["x", "y"];
    expect(isOpaque(lang, meaning)).toBe(true);
  });

  it("isOpaque returns false when stratal mode is off (defensive)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-noop";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    expect(isOpaque(lang, "any-meaning")).toBe(false);
  });
});

describe("Phase 72g-2 — reticulate contact links", () => {
  it("refreshContactLinks builds undirected pairs from bilingualLinks", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-reticulate";
    const sim = createSimulation(cfg);
    const state = sim.getState();
    // Simulate bilingual links between two synthetic leaves.
    const ids = Object.keys(state.tree);
    if (ids.length < 1) return;
    const a = ids[0]!;
    const b = "synth-partner";
    const aLang = state.tree[a]!.language;
    state.tree[b] = {
      language: { ...aLang, id: b, name: "Partner" },
      parentId: state.tree[a]!.parentId,
      childrenIds: [],
    };
    aLang.bilingualLinks = { [b]: 0.6 };
    state.tree[b].language.bilingualLinks = { [a]: 0.6 };
    refreshContactLinks(state, 5);
    expect(state.contactLinks).toBeDefined();
    const link = state.contactLinks!.find(
      (l) =>
        (l.langA === a && l.langB === b) || (l.langA === b && l.langB === a),
    );
    expect(link).toBeDefined();
    expect(link!.strength).toBeGreaterThanOrEqual(0.6);
    expect(link!.firstSeenGen).toBe(5);
    expect(link!.lastSeenGen).toBe(5);
  });

  it("linksFor returns only links involving the given language", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-linksfor";
    const sim = createSimulation(cfg);
    const state = sim.getState();
    state.contactLinks = [
      {
        langA: "X",
        langB: "Y",
        kind: "bilingual",
        strength: 0.5,
        firstSeenGen: 1,
        lastSeenGen: 1,
      },
      {
        langA: "Y",
        langB: "Z",
        kind: "bilingual",
        strength: 0.4,
        firstSeenGen: 1,
        lastSeenGen: 1,
      },
    ];
    expect(linksFor(state, "Y").length).toBe(2);
    expect(linksFor(state, "Z").length).toBe(1);
    expect(linksFor(state, "absent").length).toBe(0);
  });
});

describe("Phase 72g-3 — translator AST IR", () => {
  it("englishTokensToAST lifts a 3-token SVO sentence", () => {
    const tokens: EnglishToken[] = [
      { surface: "the king", lemma: "king", tag: "N", features: {} },
      { surface: "saw", lemma: "see", tag: "V", features: { tense: "past" } },
      { surface: "the bird", lemma: "bird", tag: "N", features: {} },
    ] as any;
    const ast = englishTokensToAST(tokens);
    expect(ast.head).toBeDefined();
    expect(ast.head!.lemma).toBe("see");
    expect(ast.participants.length).toBe(2);
    const subject = ast.participants.find((p) => p.role === "subject");
    const object = ast.participants.find((p) => p.role === "object");
    expect(subject?.lemma).toBe("king");
    expect(object?.lemma).toBe("bird");
  });

  it("astToTokens projects to SVO by default and respects alternative orders", () => {
    const tokens: EnglishToken[] = [
      { surface: "X", lemma: "X", tag: "N", features: {} },
      { surface: "Y", lemma: "Y", tag: "V", features: {} },
      { surface: "Z", lemma: "Z", tag: "N", features: {} },
    ] as any;
    const ast = englishTokensToAST(tokens);
    const svo = astToTokens(ast, "SVO").map((t) => t.lemma);
    expect(svo).toEqual(["X", "Y", "Z"]);
    const sov = astToTokens(ast, "SOV").map((t) => t.lemma);
    expect(sov).toEqual(["X", "Z", "Y"]);
    const vso = astToTokens(ast, "VSO").map((t) => t.lemma);
    expect(vso).toEqual(["Y", "X", "Z"]);
  });
});

describe("Phase 72g-4 — alignment reanalysis", () => {
  it("nom-acc + hasCase + tier ≥ 1 can flip to erg-abs via reanalysis", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-reanalysis";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    lang.grammar.alignment = "nom-acc";
    lang.grammar.hasCase = true;
    lang.culturalTier = 2;
    // RNG that returns true for the 0.015 probability gate; we craft
    // a custom rng that returns chance=true once, then false.
    let firstCall = true;
    const rng: any = {
      next: () => 0,
      int: (_n: number) => 0,
      chance: (_p: number) => {
        if (firstCall) {
          firstCall = false;
          return true;
        }
        return false;
      },
    };
    const shift = tryReanalyseAlignment(lang, rng);
    expect(shift).not.toBeNull();
    expect(shift!.feature).toBe("alignment");
    expect(shift!.from).toBe("nom-acc");
    expect(shift!.to).toBe("erg-abs");
    expect(lang.grammar.alignment).toBe("erg-abs");
  });

  it("returns null when conditions aren't met (no hasCase)", () => {
    const cfg = presetRomance();
    cfg.seed = "p72g-noreanalysis";
    const sim = createSimulation(cfg);
    const lang = sim.getState().tree["L-0"]!.language;
    lang.grammar.alignment = "nom-acc";
    lang.grammar.hasCase = false;
    const rng: any = {
      next: () => 0,
      int: (_n: number) => 0,
      chance: (_p: number) => true,
    };
    const shift = tryReanalyseAlignment(lang, rng);
    expect(shift).toBeNull();
  });
});
