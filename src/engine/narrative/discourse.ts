import type { Meaning } from "../types";

/**
 * Discourse context tracked across the lines of a multi-sentence
 * narrative. Lets the generator make linguistically coherent choices:
 *
 *   - introduce an entity in line N, refer to it as a pronoun in N+1
 *   - keep a topic across several lines (the king ... he ... his son)
 *   - vary genre-specific connectives (myth: "and so", daily: "then")
 *
 * The context is mutable across `consume*` calls — discourse is
 * stateful by nature. Construct a fresh one per narrative call so two
 * narratives don't bleed reference state into each other.
 */

export type DiscourseGenre = "myth" | "legend" | "daily" | "dialogue";

export interface DiscourseEntity {
  /** The English meaning that names this entity ("king", "wolf"). */
  meaning: Meaning;
  /** Sentence index in which it was first introduced. */
  introducedAt: number;
  /** Sentence index of last mention. */
  lastMentionedAt: number;
  /** Personal pronoun lemma to use on subsequent reference (`he`,
   *  `she`, `it`, `they`). Picked from the meaning's natural gender. */
  pronoun: "he" | "she" | "it" | "they";
}

export interface DiscourseContext {
  genre: DiscourseGenre;
  entities: Map<string, DiscourseEntity>;
  /** The most-recently introduced or mentioned entity; eligible for
   *  pronoun substitution on the next line. */
  topic: DiscourseEntity | null;
  /** Sentence count consumed so far. */
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
  if (ANIMATE.has(meaning)) return "it"; // animals get "it" by default
  return "it";
}

/**
 * Register a fresh mention of a meaning in the discourse. If it's the
 * first time, creates a new entity; otherwise updates lastMentionedAt
 * and resets `topic` to it. Returns the entity.
 */
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

/**
 * Decide whether the next mention of an entity should be rendered as
 * a pronoun. Heuristic: pronominalise when the entity was last
 * mentioned in the previous sentence (one-back) AND it's still the
 * current topic. Languages with prodrop will additionally skip the
 * pronoun at realisation time.
 */
export function shouldPronominalise(
  ctx: DiscourseContext,
  meaning: Meaning,
): boolean {
  const ent = ctx.entities.get(meaning);
  if (!ent) return false;
  const oneBack = ctx.turnIndex - ent.lastMentionedAt <= 1;
  return oneBack && ctx.topic?.meaning === meaning;
}

/**
 * Increment the discourse turn counter. Call once per generated
 * sentence after all mentions for that sentence have been registered.
 */
export function endTurn(ctx: DiscourseContext): void {
  ctx.turnIndex++;
}
