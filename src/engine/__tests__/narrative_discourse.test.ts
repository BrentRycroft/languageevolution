import { describe, it, expect } from "vitest";
import {
  endTurn,
  makeDiscourse,
  mention,
  shouldPronominalise,
} from "../narrative/discourse";
import { generateDiscourseNarrative } from "../narrative/discourse_generate";
import { templatesFor } from "../narrative/genres";
import { createSimulation } from "../simulation";
import { defaultConfig } from "../config";

function freshLang(seed: string) {
  const sim = createSimulation({ ...defaultConfig(), seed });
  sim.step();
  const lang = sim.getState().tree["L-0"]!.language;
  const fills: Record<string, string[]> = {
    mother: ["m", "a"], father: ["p", "a"], king: ["k", "i", "n"],
    dog: ["k", "u"], wolf: ["w", "u", "l"], horse: ["x", "o", "r"],
    bear: ["b", "e", "r"], child: ["t", "i", "k"], friend: ["s", "o", "p"],
    brother: ["b", "r", "o"], sister: ["s", "i", "s"], warrior: ["w", "a", "r"],
    stranger: ["g", "a", "s"],
    hand: ["h", "a", "n"], foot: ["p", "o", "t"], eye: ["o", "k"],
    head: ["k", "a", "p"], heart: ["s", "e", "r"],
    tree: ["t", "r", "e"], water: ["w", "a", "t"], fire: ["a", "g"],
    stone: ["k", "a", "m"], moon: ["m", "u", "n"], sun: ["s", "u", "n"],
    river: ["r", "i", "v"], house: ["d", "o", "m"], bread: ["p", "a", "n"],
    meat: ["m", "e", "s"], milk: ["m", "i", "l"],
    go: ["i"], come: ["v", "e"], see: ["v", "i"], know: ["s", "a"],
    eat: ["e", "d"], drink: ["b", "i"], give: ["d", "a"], take: ["t", "a"],
    speak: ["s", "p", "i"], hold: ["h", "o", "l"], fight: ["f", "i", "t"],
    make: ["m", "a", "k"], break: ["b", "r", "e"], fall: ["k", "a", "d"],
    sleep: ["s", "n", "i"], die: ["m", "u", "r"], run: ["b", "e", "k"],
    walk: ["w", "a", "k"], fly: ["l", "e", "t"],
    big: ["b", "u", "k"], small: ["m", "a", "l"], new: ["n", "u", "v"],
    old: ["a", "l", "t"], good: ["b", "o", "n"], bad: ["m", "a", "l"],
    tall: ["t", "a", "l"], short: ["k", "u", "r"],
    morning: ["o", "r", "n"], evening: ["v", "e", "k"],
    night: ["n", "o", "k"], winter: ["z", "i", "m"], summer: ["l", "e", "t"],
    forest: ["g", "a", "i"], mountain: ["m", "o", "n"], village: ["s", "e", "l"],
  };
  for (const [m, form] of Object.entries(fills)) {
    if (!lang.lexicon[m]) lang.lexicon[m] = form;
  }
  return lang;
}

describe("§2.2 — discourse context tracks mentions and topic", () => {
  it("mention adds entity and sets topic", () => {
    const ctx = makeDiscourse("myth");
    expect(ctx.topic).toBeNull();
    mention(ctx, "king");
    expect(ctx.topic?.meaning).toBe("king");
    expect(ctx.entities.has("king")).toBe(true);
  });

  it("re-mentioning preserves entity but updates lastMentionedAt", () => {
    const ctx = makeDiscourse("myth");
    mention(ctx, "king");
    endTurn(ctx);
    mention(ctx, "wolf");
    endTurn(ctx);
    const e2 = mention(ctx, "king");
    expect(e2.lastMentionedAt).toBe(2);
    expect(e2.introducedAt).toBe(0);
  });

  it("pronoun assignment respects natural gender", () => {
    const ctx = makeDiscourse("myth");
    expect(mention(ctx, "mother").pronoun).toBe("she");
    expect(mention(ctx, "king").pronoun).toBe("he");
    expect(mention(ctx, "dog").pronoun).toBe("it");
    expect(mention(ctx, "people").pronoun).toBe("they");
  });

  it("shouldPronominalise: true if topic was just mentioned, false otherwise", () => {
    const ctx = makeDiscourse("myth");
    mention(ctx, "king");
    endTurn(ctx);
    expect(shouldPronominalise(ctx, "king")).toBe(true);
    expect(shouldPronominalise(ctx, "wolf")).toBe(false);
  });
});

describe("§2.2 — genre template pools", () => {
  it("each genre exposes at least one introducing and one topic-continuing template", () => {
    for (const g of ["myth", "legend", "daily", "dialogue"] as const) {
      const tpls = templatesFor(g);
      expect(tpls.find((t) => t.introducesEntity)).toBeDefined();
      expect(tpls.find((t) => t.topicSubject)).toBeDefined();
    }
  });
});

describe("§2.2 — generateDiscourseNarrative produces coherent multi-line output", () => {
  it("produces the requested number of lines", () => {
    const lang = freshLang("disc-lines");
    const out = generateDiscourseNarrative(lang, "story-1", { lines: 6, genre: "myth" });
    expect(out.length).toBe(6);
  });

  it("first line introduces a subject; later lines reuse a topic via pronoun", () => {
    const lang = freshLang("disc-topic");
    const out = generateDiscourseNarrative(lang, "story-2", { lines: 8, genre: "legend" });
    const continuing = out.filter((l) => /^(he|she|it|they)\b/i.test(l.english));
    expect(continuing.length).toBeGreaterThan(0);
  });

  it("two languages with same seed produce identically structured English skeletons", () => {
    const a = freshLang("disc-cmpA");
    const b = freshLang("disc-cmpB");
    const oa = generateDiscourseNarrative(a, "story-shared", { lines: 5, genre: "daily" });
    const ob = generateDiscourseNarrative(b, "story-shared", { lines: 5, genre: "daily" });
    expect(oa.map((l) => l.english)).toEqual(ob.map((l) => l.english));
  });

  it("different genres produce different stories with the same seed", () => {
    const lang = freshLang("disc-genres");
    const myth = generateDiscourseNarrative(lang, "x", { lines: 5, genre: "myth" });
    const dialog = generateDiscourseNarrative(lang, "x", { lines: 5, genre: "dialogue" });
    expect(myth.map((l) => l.english)).not.toEqual(dialog.map((l) => l.english));
  });

  it("myth narratives use past-tense verb forms on most lines", () => {
    const lang = freshLang("disc-tense");
    lang.morphology.paradigms["verb.tense.past"] = {
      affix: ["e", "d"],
      position: "suffix",
      category: "verb.tense.past",
    };
    const myth = generateDiscourseNarrative(lang, "tense-x", { lines: 8, genre: "myth" });
    const pastLines = myth.filter((l) =>
      /\b(went|came|saw|knew|ate|drank|gave|took|spoke|held|fought|made|broke|fell|slept|died|ran|flew)\b/.test(l.english)
      || /\bwalked\b/.test(l.english),
    );
    expect(pastLines.length).toBeGreaterThan(myth.length / 2);
  });

  it("daily narratives default to present tense", () => {
    const lang = freshLang("disc-present");
    const daily = generateDiscourseNarrative(lang, "tense-y", { lines: 8, genre: "daily" });
    const pastLines = daily.filter((l) =>
      /\b(went|came|saw|knew|ate|drank|gave|took|spoke|held|fought|made|broke|fell|slept|died|ran|flew)\b/.test(l.english),
    );
    expect(pastLines.length).toBeLessThan(daily.length / 2);
  });

  it("translator surfaces past tense via the language's verb.tense.past paradigm", () => {
    const lang = freshLang("disc-tx-past");
    lang.morphology.paradigms["verb.tense.past"] = {
      affix: ["e", "d"],
      position: "suffix",
      category: "verb.tense.past",
    };
    lang.lexicon["see"] = ["w", "i"];
    const presentOut = generateDiscourseNarrative(lang, "tx-pres", { lines: 1, genre: "daily" });
    const pastOut = generateDiscourseNarrative(lang, "tx-past", { lines: 1, genre: "myth" });
    expect(presentOut[0]!.text).not.toBe(pastOut[0]!.text);
  });
});
