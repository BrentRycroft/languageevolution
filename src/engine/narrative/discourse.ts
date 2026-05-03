import type { Meaning } from "../types";

export type DiscourseGenre = "myth" | "legend" | "daily" | "dialogue" | "poetry";

export interface DiscourseEntity {
  meaning: Meaning;
  introducedAt: number;
  lastMentionedAt: number;
  pronoun: "he" | "she" | "it" | "they";
}

export interface DiscourseContext {
  genre: DiscourseGenre;
  entities: Map<string, DiscourseEntity>;
  topic: DiscourseEntity | null;
  turnIndex: number;
}

export function makeDiscourse(genre: DiscourseGenre): DiscourseContext {
  return {
    genre,
    entities: new Map(),
    topic: null,
    turnIndex: 0,
  };
}

const FEMININE = new Set(["mother", "sister", "daughter", "wife", "queen", "girl", "woman"]);
const MASCULINE = new Set(["father", "brother", "son", "husband", "king", "boy", "man", "warrior", "priest", "stranger"]);
const PLURAL = new Set(["children", "men", "women", "people"]);
const ANIMATE = new Set([
  "child", "friend", "guest", "enemy", "hero", "lord", "servant",
  "dog", "wolf", "horse", "cow", "bird", "fish", "snake", "bear", "cat",
]);

function pronounFor(meaning: Meaning): DiscourseEntity["pronoun"] {
  if (PLURAL.has(meaning)) return "they";
  if (FEMININE.has(meaning)) return "she";
  if (MASCULINE.has(meaning)) return "he";
  if (ANIMATE.has(meaning)) return "it";
  return "it";
}

export function mention(ctx: DiscourseContext, meaning: Meaning): DiscourseEntity {
  let ent = ctx.entities.get(meaning);
  if (!ent) {
    ent = {
      meaning,
      introducedAt: ctx.turnIndex,
      lastMentionedAt: ctx.turnIndex,
      pronoun: pronounFor(meaning),
    };
    ctx.entities.set(meaning, ent);
  } else {
    ent.lastMentionedAt = ctx.turnIndex;
  }
  ctx.topic = ent;
  return ent;
}

export function shouldPronominalise(
  ctx: DiscourseContext,
  meaning: Meaning,
): boolean {
  const ent = ctx.entities.get(meaning);
  if (!ent) return false;
  const oneBack = ctx.turnIndex - ent.lastMentionedAt <= 1;
  return oneBack && ctx.topic?.meaning === meaning;
}

export function endTurn(ctx: DiscourseContext): void {
  ctx.turnIndex++;
}
