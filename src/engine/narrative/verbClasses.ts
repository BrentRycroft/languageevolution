/**
 * Phase 36 Tranche 36d: small verb-class registry. Tags ~40 high-
 * frequency verbs as punctual (one-shot, bounded events), durative
 * (extended action), or stative (states / properties). The composer
 * uses these to pick aspect when the language has a grammaticalised
 * pfv/ipfv distinction or richer aspect system.
 */

export type VerbClass = "punctual" | "durative" | "stative";

const PUNCTUAL: ReadonlySet<string> = new Set([
  "come", "go", "arrive", "leave", "fall", "throw", "hit", "kick",
  "give", "take", "find", "lose", "win", "open", "close", "kill",
  "die", "break", "begin", "end", "start", "stop", "shoot", "drop",
  "catch", "buy", "sell", "send", "say", "answer", "call", "ask",
]);

const DURATIVE: ReadonlySet<string> = new Set([
  "walk", "run", "swim", "fly", "speak", "sing", "dance", "play",
  "work", "build", "write", "read", "eat", "drink", "wash", "weave",
  "carry", "push", "pull", "dig", "burn", "grow", "cook", "weep",
  "laugh", "watch", "wait", "search", "follow", "hunt", "fight",
]);

const STATIVE: ReadonlySet<string> = new Set([
  "be", "have", "know", "think", "love", "fear", "want", "need",
  "see", "hear", "feel", "live", "stand", "sit", "lie", "remain",
  "belong", "cost", "weigh", "seem", "look", "appear", "exist",
  "own", "matter", "concern", "depend",
]);

export function verbClassOf(lemma: string): VerbClass {
  if (STATIVE.has(lemma)) return "stative";
  if (DURATIVE.has(lemma)) return "durative";
  if (PUNCTUAL.has(lemma)) return "punctual";
  // Default to punctual — most low-frequency verbs in narrative
  // contexts denote events.
  return "punctual";
}

/**
 * Pick the aspect best suited to a verb-tense-class combination given
 * the language's aspect system. Returns one of: "perfective",
 * "imperfective", "progressive", "habitual", "perfect", or null
 * (no marking — falls through to the genre default).
 */
export function pickAspect(
  lemma: string,
  tense: "past" | "present" | "future",
  aspectSystem: "simple" | "pfv-ipfv" | "prog" | "rich",
): "perfective" | "imperfective" | "progressive" | "habitual" | "perfect" | null {
  if (aspectSystem === "simple") return null;
  const cls = verbClassOf(lemma);
  if (aspectSystem === "pfv-ipfv") {
    if (tense !== "past") return null;
    if (cls === "stative" || cls === "durative") return "imperfective";
    return "perfective";
  }
  if (aspectSystem === "prog") {
    if (tense === "present" && cls !== "stative") return "progressive";
    return null;
  }
  // "rich"
  if (tense === "past") {
    if (cls === "stative") return "imperfective";
    if (cls === "durative") return "imperfective";
    return "perfective";
  }
  if (tense === "present" && cls === "durative") return "progressive";
  return null;
}
