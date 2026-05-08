import type { Meaning } from "../types";

/**
 * discourse.ts
 *
 * Discourse-genre narrative composer (target-side composer.ts), legacy skeleton mode (generate.ts), discourse model (mention / logophoric). Key exports: DiscourseGenre, DiscourseEntity, DiscourseContext.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type DiscourseGenre = "myth" | "legend" | "daily" | "dialogue" | "poetry";

export interface DiscourseEntity {
  meaning: Meaning;
  introducedAt: number;
  lastMentionedAt: number;
  pronoun: "he" | "she" | "it" | "they";
  /**
   * Phase 65 T1: number of times this entity has been "mentioned"
   * (i.e., `mention()` invoked). 1 on its first mention, 2+ on
   * subsequent. Read by `articleRoleToken` to decide indefinite vs
   * definite: count === 1 → "a/an"; count > 1 → "the".
   */
  mentionCount: number;
}

export interface DiscourseContext {
  genre: DiscourseGenre;
  entities: Map<string, DiscourseEntity>;
  topic: DiscourseEntity | null;
  turnIndex: number;
  /**
   * Phase 65 T2: quoted-speech frame stack. When a narrative line
   * embeds a quotation ("X said Y did Z"), the matrix subject (X) is
   * pushed onto the stack; references to X *inside* the quoted
   * clause use a logophoric pronoun (Ewe: yè), distinguishing them
   * from references to a different referent (regular he/she).
   * Popped at end of the embedded clause.
   */
  quotedFrameStack: DiscourseEntity[];
  /**
   * Phase 65 T2: convenience pointer to the topmost
   * `quotedFrameStack` entry — the current logophoric center.
   * Updated whenever push/pop fires. Null when no quotation is
   * active. Read by `pronounRoleToken`.
   */
  logophoricCenter: DiscourseEntity | null;
}

export function makeDiscourse(genre: DiscourseGenre): DiscourseContext {
  return {
    genre,
    entities: new Map(),
    topic: null,
    turnIndex: 0,
    quotedFrameStack: [],
    logophoricCenter: null,
  };
}

/**
 * Phase 65 T2: push a quoted-speech frame. The matrix subject
 * becomes the logophoric center for as long as the frame is on
 * the stack.
 */
export function pushQuotedFrame(
  ctx: DiscourseContext,
  matrixSubject: DiscourseEntity,
): void {
  ctx.quotedFrameStack.push(matrixSubject);
  ctx.logophoricCenter = matrixSubject;
}

/**
 * Phase 65 T2: pop the topmost quoted frame; updates the
 * logophoric center to whatever frame is now on top (or null).
 */
export function popQuotedFrame(ctx: DiscourseContext): DiscourseEntity | null {
  const popped = ctx.quotedFrameStack.pop() ?? null;
  ctx.logophoricCenter =
    ctx.quotedFrameStack[ctx.quotedFrameStack.length - 1] ?? null;
  return popped;
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
      mentionCount: 1,
    };
    ctx.entities.set(meaning, ent);
  } else {
    ent.lastMentionedAt = ctx.turnIndex;
    ent.mentionCount += 1;
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
