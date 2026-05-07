import type { Language, LanguageEvent } from "../types";
import type { MorphCategory, Paradigm } from "./types";

/**
 * Phase 56 T2: paradigm renewal — when a sound change reduces two
 * paradigms to homophony, the simulator detects the merger and
 * emits a `paradigm-renewal` event. Real-world parallel: Latin
 * `-ās` (acc.pl) and `-am` (acc.sg) collapsed to `-a` in Vulgar
 * Latin; the language responded by recruiting new accusative
 * markers (eventually losing case marking entirely).
 *
 * This phase ships the DETECTOR. Renewal-driven affix recruitment
 * is the next step (would land via existing
 * `attemptTargetedDerivation` extended with affix-injection).
 *
 * Algorithm: walk pairs of paradigm entries. If two distinct
 * categories now produce identical surface affixes, emit one
 * paradigm-renewal event per pair (idempotent — once flagged,
 * the language won't re-emit until a NEW collision appears).
 */

interface Collision {
  catA: MorphCategory;
  catB: MorphCategory;
  affix: string;
}

function affixKey(p: Paradigm | undefined): string | null {
  if (!p) return null;
  if (!p.affix || p.affix.length === 0) return null;
  return `${p.position}:${p.affix.join("")}`;
}

export function detectParadigmCollisions(lang: Language): Collision[] {
  const paradigms = lang.morphology.paradigms;
  const cats = Object.keys(paradigms) as MorphCategory[];
  const byKey = new Map<string, MorphCategory[]>();
  for (const c of cats) {
    const key = affixKey(paradigms[c]);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(c);
    byKey.set(key, list);
  }
  const collisions: Collision[] = [];
  for (const [key, group] of byKey.entries()) {
    if (group.length < 2) continue;
    // Emit one collision per pair (lower-cat × higher-cat).
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        collisions.push({
          catA: group[i]!,
          catB: group[j]!,
          affix: key,
        });
      }
    }
  }
  return collisions;
}

export function detectAndLogParadigmRenewal(
  lang: Language,
  generation: number,
): number {
  const collisions = detectParadigmCollisions(lang);
  if (collisions.length === 0) return 0;
  // Idempotency: only emit a renewal event for collisions we haven't
  // already logged. Track via lang.events.
  if (!lang.events) lang.events = [];
  const existingKeys = new Set<string>();
  for (const e of lang.events) {
    if (e.kind === "paradigm-renewal" && e.meta?.collisionKey) {
      existingKeys.add(e.meta.collisionKey as string);
    }
  }
  let emitted = 0;
  for (const c of collisions) {
    const k = `${c.catA}|${c.catB}|${c.affix}`;
    if (existingKeys.has(k)) continue;
    const event: LanguageEvent = {
      generation,
      kind: "paradigm-renewal",
      description: `paradigm collision: ${c.catA} and ${c.catB} share affix ${c.affix}`,
      meta: { collisionKey: k, catA: c.catA, catB: c.catB, affix: c.affix },
    };
    lang.events.push(event);
    emitted++;
  }
  return emitted;
}
