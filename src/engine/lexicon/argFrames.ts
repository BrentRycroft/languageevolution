import type { Meaning } from "../types";
import type { SemanticRole } from "../translator/roleFrame";
import { posOf } from "./pos";

/**
 * argFrames.ts — Phase 73c Tier C Phase 5 (C4).
 *
 * Per-lemma argument-frame table. Maps a verb to the ordered list
 * of `SemanticRole`s its arguments fill — `argFrame[0]` is the
 * subject role, `argFrame[1]` is the direct-object role
 * (where applicable), `argFrame[2]` is the indirect-object role
 * for ditransitives.
 *
 * Used by:
 *   - `narrative/roleProjection.ts:composeTargetClause` to label
 *     subject and object participants.
 *   - `translator/parse.ts:parseSyntaxToClause` to label parsed
 *     participants.
 *
 * Coverage: ~50 high-frequency verbs where the default
 * `["agent", "patient"]` frame would be wrong:
 *   - psych predicates (see, hear, fear, know) → experiencer + stimulus
 *   - unaccusatives (fall, die, arrive) → theme
 *   - ditransitives (give, send, tell) → agent + theme + recipient
 *   - motion (go, come) → theme
 * Verbs not in the table fall back to the default frame.
 *
 * Phase 6+ can extend this table or migrate to per-concept
 * `argFrame` declarations on the `Concept` registry; for now the
 * table is the authoritative source.
 */

const DEFAULT_TRANSITIVE_FRAME: ReadonlyArray<SemanticRole> = ["agent", "patient"];

const VERB_ARG_FRAMES: Readonly<Record<Meaning, ReadonlyArray<SemanticRole>>> = {
  // Psych predicates — subject is the EXPERIENCER, not an agent.
  // The subject doesn't volitionally cause the event; it
  // perceives or undergoes a mental state. Object (when present)
  // is the STIMULUS that triggers the perception.
  see: ["experiencer", "stimulus"],
  hear: ["experiencer", "stimulus"],
  feel: ["experiencer", "stimulus"],
  smell: ["experiencer", "stimulus"],
  taste: ["experiencer", "stimulus"],
  watch: ["experiencer", "stimulus"],
  listen: ["experiencer", "stimulus"],
  know: ["experiencer", "stimulus"],
  think: ["experiencer", "stimulus"],
  believe: ["experiencer", "stimulus"],
  understand: ["experiencer", "stimulus"],
  remember: ["experiencer", "stimulus"],
  forget: ["experiencer", "stimulus"],
  notice: ["experiencer", "stimulus"],
  perceive: ["experiencer", "stimulus"],
  // Psych-emotion predicates.
  like: ["experiencer", "stimulus"],
  love: ["experiencer", "stimulus"],
  hate: ["experiencer", "stimulus"],
  fear: ["experiencer", "stimulus"],
  want: ["experiencer", "stimulus"],
  need: ["experiencer", "stimulus"],
  hope: ["experiencer", "stimulus"],
  wish: ["experiencer", "stimulus"],
  enjoy: ["experiencer", "stimulus"],

  // Ditransitives — three core args: agent + theme + recipient.
  // The simulator's binary participant slots only capture two
  // today, but the frame is correct for downstream consumers.
  give: ["agent", "theme", "recipient"],
  send: ["agent", "theme", "recipient"],
  tell: ["agent", "theme", "recipient"],
  show: ["agent", "theme", "recipient"],
  bring: ["agent", "theme", "recipient"],
  teach: ["agent", "theme", "recipient"],
  offer: ["agent", "theme", "recipient"],
  pay: ["agent", "theme", "recipient"],
  sell: ["agent", "theme", "recipient"],
  lend: ["agent", "theme", "recipient"],

  // Unaccusatives — single-argument verbs where the subject
  // is the THEME (the thing undergoing the event), not an agent
  // that initiates it. Many languages mark these distinctively
  // (split-S alignment, perfect-auxiliary selection: French
  // être-perfect, German sein-perfect).
  fall: ["theme"],
  die: ["theme"],
  break: ["theme"],
  arrive: ["theme"],
  come: ["theme"],
  go: ["theme"],
  appear: ["theme"],
  disappear: ["theme"],
  rise: ["theme"],
  sink: ["theme"],
  grow: ["theme"],

  // Mover predicates with optional goal/source — subject is theme.
  walk: ["theme"],
  run: ["theme"],
  swim: ["theme"],
  fly: ["theme"],
  jump: ["theme"],

  // Speech-acts: the speaker is agent; what's said is theme.
  say: ["agent", "theme"],
  speak: ["agent", "theme"],
  ask: ["agent", "theme"],
  answer: ["agent", "theme"],
  shout: ["agent", "theme"],
  whisper: ["agent", "theme"],
};

/**
 * Look up a verb's argument-frame. Returns the registered frame
 * if available, the default transitive frame for verbs, or
 * undefined for non-verb meanings.
 */
export function argFrameFor(meaning: Meaning): ReadonlyArray<SemanticRole> | undefined {
  const registered = VERB_ARG_FRAMES[meaning];
  if (registered) return registered;
  if (posOf(meaning) === "verb") return DEFAULT_TRANSITIVE_FRAME;
  return undefined;
}

/**
 * Resolve the subject role for a verb. Returns `argFrame[0]` or
 * `"agent"` as the safe fallback.
 */
export function subjectRoleOf(meaning: Meaning): SemanticRole {
  return argFrameFor(meaning)?.[0] ?? "agent";
}

/**
 * Resolve the direct-object role for a verb. Returns `argFrame[1]`
 * or `"patient"` as the safe fallback. Returns `undefined` only
 * for monovalent verbs (where `argFrame` has length 1).
 */
export function objectRoleOf(meaning: Meaning): SemanticRole {
  const f = argFrameFor(meaning);
  if (!f || f.length < 2) return "patient";
  return f[1]!;
}

/**
 * True for unaccusatives — verbs whose subject is the patient/
 * theme of the event rather than an agent. Useful for languages
 * with split-S alignment or unaccusative-distinct perfect
 * auxiliaries.
 */
export function isUnaccusative(meaning: Meaning): boolean {
  return subjectRoleOf(meaning) === "theme";
}
