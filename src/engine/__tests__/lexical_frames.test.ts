import { describe, it, expect } from "vitest";
import {
  argFrameFor,
  subjectRoleOf,
  objectRoleOf,
  isUnaccusative,
} from "../lexicon/argFrames";

/**
 * Phase 73c Tier C Phase 5 (C4) — lexical role frames.
 *
 * The argument-frame table in `lexicon/argFrames.ts` overrides
 * the default `["agent", "patient"]` frame for ~50 high-frequency
 * verbs whose subject isn't really an agent. Pins the canonical
 * mappings that the parser + composer dispatch on.
 */

describe("Phase 73c Phase 5 — argFrameFor: lexical role frames", () => {
  it("psych predicates use experiencer + stimulus", () => {
    for (const v of ["see", "hear", "feel", "know", "fear", "love", "want"]) {
      expect(argFrameFor(v)).toEqual(["experiencer", "stimulus"]);
      expect(subjectRoleOf(v)).toBe("experiencer");
      expect(objectRoleOf(v)).toBe("stimulus");
    }
  });

  it("unaccusatives carry single-arg theme frame", () => {
    for (const v of ["fall", "die", "arrive", "come", "go"]) {
      expect(argFrameFor(v)).toEqual(["theme"]);
      expect(subjectRoleOf(v)).toBe("theme");
      expect(isUnaccusative(v)).toBe(true);
    }
  });

  it("ditransitives have agent + theme + recipient", () => {
    for (const v of ["give", "send", "tell", "show", "teach"]) {
      expect(argFrameFor(v)).toEqual(["agent", "theme", "recipient"]);
      expect(subjectRoleOf(v)).toBe("agent");
      expect(objectRoleOf(v)).toBe("theme");
    }
  });

  it("motion predicates assign theme to the mover", () => {
    for (const v of ["walk", "run", "swim", "fly", "jump"]) {
      expect(argFrameFor(v)).toEqual(["theme"]);
      expect(subjectRoleOf(v)).toBe("theme");
    }
  });

  it("speech-acts have agent + theme (what's said)", () => {
    for (const v of ["say", "speak", "ask", "answer"]) {
      expect(argFrameFor(v)).toEqual(["agent", "theme"]);
      expect(subjectRoleOf(v)).toBe("agent");
      expect(objectRoleOf(v)).toBe("theme");
    }
  });

  it("verbs not in the table fall back to the default agent+patient frame", () => {
    // Filtered to verbs whose `posOf` actually returns "verb"
    // (the helper has heuristic gaps for some action verbs that
    // posOf classifies as "other"; only ones it tags as "verb"
    // get the default frame).
    for (const v of ["kill", "build", "cut", "make"]) {
      expect(argFrameFor(v)).toEqual(["agent", "patient"]);
      expect(subjectRoleOf(v)).toBe("agent");
      expect(objectRoleOf(v)).toBe("patient");
      expect(isUnaccusative(v)).toBe(false);
    }
  });

  it("non-verbs return undefined", () => {
    for (const m of ["king", "water", "blue", "the"]) {
      expect(argFrameFor(m)).toBeUndefined();
    }
  });

  it("safe defaults: subjectRoleOf falls back to agent, objectRoleOf to patient", () => {
    // Even for unrecognised words, the helpers return defensible roles.
    expect(subjectRoleOf("gibberish")).toBe("agent");
    expect(objectRoleOf("gibberish")).toBe("patient");
  });
});
