import type { Language, Meaning } from "../types";
import type { Rng } from "../rng";
import { colexWith, isRegisteredConcept } from "../lexicon/concepts";
import { isFormLegal } from "../phonology/wordShape";
import { recordOneSidedColexification } from "./colexification";

export type RecarveEventKind = "merge" | "split";

export interface RecarveEvent {
  kind: RecarveEventKind;
  loser?: Meaning;
  winner?: Meaning;
  source?: Meaning;
  newTarget?: Meaning;
}

export function maybeRecarve(
  lang: Language,
  rng: Rng,
  probability: number,
): RecarveEvent | null {
  if (!rng.chance(probability)) return null;
  if (rng.chance(0.55)) {
    const merged = tryMerge(lang, rng);
    if (merged) return merged;
    return trySplit(lang, rng);
  }
  const split = trySplit(lang, rng);
  if (split) return split;
  return tryMerge(lang, rng);
}

function tryMerge(lang: Language, rng: Rng): RecarveEvent | null {
  const lex = lang.lexicon;
  const meanings = Object.keys(lex).filter(isRegisteredConcept);
  const pairs: Array<readonly [Meaning, Meaning]> = [];
  const seen = new Set<string>();
  for (const a of meanings) {
    for (const b of colexWith(a)) {
      if (!lex[b]) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push([a, b]);
    }
  }
  if (pairs.length === 0) return null;
  const [a, b] = pairs[rng.int(pairs.length)]!;
  const fa = lang.wordFrequencyHints[a] ?? 0.4;
  const fb = lang.wordFrequencyHints[b] ?? 0.4;
  const winner = fa > fb ? a : fa < fb ? b : a < b ? a : b;
  const loser = winner === a ? b : a;
  delete lang.lexicon[loser];
  delete lang.wordFrequencyHints[loser];
  delete lang.wordOrigin[loser];
  delete lang.localNeighbors[loser];
  delete lang.lastChangeGeneration[loser];
  if (lang.registerOf) delete lang.registerOf[loser];
  if (lang.suppletion) delete lang.suppletion[loser];
  recordOneSidedColexification(lang, winner, loser);
  return { kind: "merge", winner, loser };
}

export function applyKinshipSimplification(
  lang: Language,
  rng: Rng,
  maxEvents = 2,
): RecarveEvent[] {
  const out: RecarveEvent[] = [];
  const KINSHIP_PAIRS: ReadonlyArray<readonly [Meaning, Meaning]> = [
    ["mother", "aunt"],
    ["father", "uncle"],
    ["brother", "cousin"],
    ["sister", "cousin"],
    ["child", "son"],
    ["child", "baby"],
    ["friend", "neighbor"],
  ];
  for (let attempts = 0; attempts < maxEvents * 3 && out.length < maxEvents; attempts++) {
    const [a, b] = KINSHIP_PAIRS[rng.int(KINSHIP_PAIRS.length)]!;
    if (!lang.lexicon[a] || !lang.lexicon[b]) continue;
    const fa = lang.wordFrequencyHints[a] ?? 0.4;
    const fb = lang.wordFrequencyHints[b] ?? 0.4;
    const winner = fa >= fb ? a : b;
    const loser = winner === a ? b : a;
    delete lang.lexicon[loser];
    delete lang.wordFrequencyHints[loser];
    delete lang.wordOrigin[loser];
    delete lang.localNeighbors[loser];
    delete lang.lastChangeGeneration[loser];
    if (lang.registerOf) delete lang.registerOf[loser];
    if (lang.suppletion) delete lang.suppletion[loser];
    recordOneSidedColexification(lang, winner, loser);
    out.push({ kind: "merge", winner, loser });
  }
  return out;
}

function trySplit(lang: Language, rng: Rng): RecarveEvent | null {
  const lex = lang.lexicon;
  const meanings = Object.keys(lex).filter(isRegisteredConcept);
  const candidates: Array<{ source: Meaning; target: Meaning }> = [];
  for (const source of meanings) {
    for (const target of colexWith(source)) {
      if (lex[target]) continue;
      candidates.push({ source, target });
    }
  }
  if (candidates.length === 0) return null;
  const pick = candidates[rng.int(candidates.length)]!;
  const form = lex[pick.source]!;
  if (!isFormLegal(pick.target, form)) return null;
  lang.lexicon[pick.target] = form.slice();
  const freq = lang.wordFrequencyHints[pick.source] ?? 0.4;
  lang.wordFrequencyHints[pick.target] = freq;
  const reg = lang.registerOf?.[pick.source];
  if (reg !== undefined) {
    if (!lang.registerOf) lang.registerOf = {};
    lang.registerOf[pick.target] = reg;
  }
  lang.wordOrigin[pick.target] = `split:${pick.source}`;
  return { kind: "split", source: pick.source, newTarget: pick.target };
}
