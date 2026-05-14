import type { Language, Meaning } from "../types";
import type { DiscourseContext } from "./discourse";
import type {
  Participant,
  ParticipantModifier,
  PredicateFeatures,
  RoleClause,
  SemanticRole,
} from "../translator/syntax";
import type { AbstractTemplate, SlotAssignment, TemplateShape } from "./composer";
import { subjectRoleOf, objectRoleOf } from "../lexicon/argFrames";

/**
 * roleProjection.ts — Tier C Phase 2 (Phase 73c).
 *
 * `composeTargetClause` builds a `RoleClause` (the participant-role
 * IR introduced in Phase 0) from the same `(lang, template, slots,
 * ctx)` inputs the existing composer consumes. It's PURE: no token
 * emission, no side effects, no lexicon mutation.
 *
 * The clause captures structural intent (predicate features +
 * participants + role labels). Token realisation continues to flow
 * through the existing composer body (now factored as
 * `projectRoleClauseToTokens` in `composer.ts`). The Phase 2
 * contract is that this refactor produces BYTE-IDENTICAL narrative
 * output — the clause is a parallel view used for tests and to set
 * up Phase 3 (parser emits RoleClause) and Phase 4 (realiser
 * consumes RoleClause).
 *
 * Phase 5 (lexical role frames) will refine role labels via the
 * predicate's `argFrame`: e.g. `see` will assign its subject
 * `experiencer` instead of `agent`. For Phase 2 the assignment is
 * positional + template-shape-driven, matching what the existing
 * composer effectively does.
 */

/**
 * Decide the semantic role of the subject participant. Phase 5
 * dispatches on the predicate's lexical `argFrame` (table in
 * `lexicon/argFrames.ts`): `see` → experiencer, `fall` → theme,
 * `give` → agent, default → agent for verbs not in the table.
 */
function subjectRoleFor(verb: Meaning): SemanticRole {
  return subjectRoleOf(verb);
}

/**
 * Decide the semantic role of the object participant. Phase 5
 * dispatches on the predicate's lexical `argFrame`: `see` →
 * stimulus, `give` → theme, default → patient.
 */
function objectRoleFor(verb: Meaning): SemanticRole {
  return objectRoleOf(verb);
}

/**
 * Decide the semantic role of the `place` slot based on the
 * template shape. The legacy composer dispatches preposition + PP
 * shape from `template.shape`; the clause records the role tag so
 * Phase 4's realiser can derive the same dispatch without reading
 * the template directly.
 */
function placeRoleFor(shape: TemplateShape): SemanticRole {
  switch (shape) {
    case "instrument_adjunct": return "instrument";
    case "benefactive":        return "recipient";
    case "motion_source":      return "source";
    case "motion_goal":        return "goal";
    default:                   return "location";
  }
}

/**
 * Map an `AbstractTemplate` + `SlotAssignment` to a `RoleClause`.
 * The current call sites in `discourse_generate.ts` populate
 * templates from the genre pool and slots from the lexicon
 * (`fillSlots`); this function gives the resulting clause its
 * IR-shape view.
 */
export function composeTargetClause(
  lang: Language,
  template: AbstractTemplate,
  slots: SlotAssignment,
  ctx: DiscourseContext,
): RoleClause {
  void lang; // reserved for Phase 5+ (argFrame lookup via lang.lexicon concepts)
  void ctx;  // reserved for Phase 4+ (topic-pronominal participants)

  const adjOnSubject = template.shape === "adj_subject";
  const adjOnObject =
    template.shape === "transitive_adj" ||
    template.shape === "long_ago_trans_adj";

  const participants: Participant[] = [];

  if (slots.subject) {
    const subjectModifiers: ParticipantModifier[] = [];
    if (adjOnSubject && slots.adjective) {
      subjectModifiers.push({ kind: "adjective", lemma: slots.adjective });
    }
    participants.push({
      lemma: slots.subject,
      pos: "N",
      role: subjectRoleFor(slots.verb),
      ...(subjectModifiers.length > 0 ? { modifiers: subjectModifiers } : {}),
    });
  }

  if (slots.object && template.needs.object) {
    const objectModifiers: ParticipantModifier[] = [];
    if (adjOnObject && slots.adjective) {
      objectModifiers.push({ kind: "adjective", lemma: slots.adjective });
    }
    participants.push({
      lemma: slots.object,
      pos: "N",
      role: objectRoleFor(slots.verb),
      ...(objectModifiers.length > 0 ? { modifiers: objectModifiers } : {}),
    });
  }

  if (slots.time) {
    participants.push({
      lemma: slots.time,
      pos: "N",
      role: "time",
      adjunct: true,
    });
  }

  if (slots.place) {
    participants.push({
      lemma: slots.place,
      pos: "N",
      role: placeRoleFor(template.shape),
      adjunct: true,
    });
  }

  const features: PredicateFeatures = { tense: template.tense };
  if (template.aspect === "perfect") features.aspect = "perfect";

  return {
    kind: "RoleClause",
    predicate: {
      lemma: slots.verb,
      features,
    },
    participants,
    ...(template.negated ? { negated: true } : {}),
  };
}
