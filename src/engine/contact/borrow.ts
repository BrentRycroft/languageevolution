import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { leafIds } from "../tree/split";
import { isVowel } from "../phonology/ipa";
import { isFormLegal } from "../phonology/wordShape";
import { geoDistance } from "../geo";
import type { WorldMap } from "../geo/map";
import { arealShareAffinity } from "../geo/territory";

export interface LoanEvent {
  donor: string;
  donorId: string;
  meaning: string;
  originalForm: string;
  adaptedForm: string;
  distance: number;
}

const BORROW_HALF_LIFE = 200;

export function tryBorrow(
  recipient: Language,
  tree: LanguageTree,
  rng: Rng,
  probability: number,
  worldMap?: WorldMap,
): LoanEvent | null {
  const donors = leafIds(tree).filter(
    (id) =>
      id !== recipient.id &&
      tree[id]!.language.extinct !== true &&
      !isAncestor(tree, id, recipient.id),
  );
  if (donors.length === 0) return null;

  const recipCoords = recipient.coords;
  const weighted: Array<{ id: string; weight: number }> = donors.map((id) => {
    const donor = tree[id]!.language;
    if (worldMap && recipient.territory && donor.territory) {
      const shareAffinity = arealShareAffinity(worldMap, recipient, donor);
      return { id, weight: 0.1 + shareAffinity };
    }
    const donorCoords = donor.coords;
    if (!recipCoords || !donorCoords) {
      return { id, weight: 1 };
    }
    const d = geoDistance(recipCoords, donorCoords);
    return { id, weight: BORROW_HALF_LIFE / (BORROW_HALF_LIFE + d) };
  });
  const maxWeight = weighted.reduce((m, w) => (w.weight > m ? w.weight : m), 0);
  if (!rng.chance(probability * maxWeight)) return null;

  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  let r = rng.next() * totalWeight;
  let donorId = weighted[0]!.id;
  for (const w of weighted) {
    r -= w.weight;
    if (r <= 0) {
      donorId = w.id;
      break;
    }
  }
  const donor = tree[donorId]!.language;
  const distance =
    recipCoords && donor.coords ? geoDistance(recipCoords, donor.coords) : 0;

  const donorMeanings = Object.keys(donor.lexicon);
  const candidates = donorMeanings.filter((m) => !recipient.lexicon[m]);
  const pool = candidates.length > 0 ? candidates : donorMeanings;
  if (pool.length === 0) return null;
  const meaning = pool[rng.int(pool.length)]!;
  const originalForm = donor.lexicon[meaning]!;
  const adapted = adaptPhonemes(originalForm, recipient, rng);
  if (adapted.length === 0) return null;
  if (!isFormLegal(meaning, adapted)) return null;
  recipient.lexicon[meaning] = adapted;
  const donorPop = donor.speakers ?? 10000;
  const recipPop = recipient.speakers ?? 10000;
  const prestige: "high" | "low" = donorPop > recipPop * 2 ? "high" : "low";
  if (!recipient.registerOf) recipient.registerOf = {};
  recipient.registerOf[meaning] = prestige;
  recipient.wordFrequencyHints[meaning] = Math.max(
    recipient.wordFrequencyHints[meaning] ?? 0,
    prestige === "high" ? 0.55 : 0.45,
  );
  return {
    donor: donor.name,
    donorId,
    meaning,
    originalForm: originalForm.join(""),
    adaptedForm: adapted.join(""),
    distance,
  };
}

function isAncestor(tree: LanguageTree, candidateAncestorId: string, descendantId: string): boolean {
  let cur: string | null = descendantId;
  while (cur) {
    if (cur === candidateAncestorId) return true;
    cur = tree[cur]?.parentId ?? null;
  }
  return false;
}

function adaptPhonemes(form: string[], recipient: Language, rng: Rng): string[] {
  const inv = new Set(recipient.phonemeInventory.segmental);
  if (inv.size === 0) return form.slice();
  return form.map((p) => {
    if (inv.has(p)) return p;
    const targetVowel = isVowel(p);
    const candidates = recipient.phonemeInventory.segmental.filter(
      (q) => isVowel(q) === targetVowel,
    );
    if (candidates.length === 0) return p;
    return candidates[rng.int(candidates.length)]!;
  });
}
