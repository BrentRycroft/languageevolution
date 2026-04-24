import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { leafIds } from "../tree/split";
import { geoDistance } from "../geo";
import { isVowel } from "../phonology/ipa";

/**
 * Areal phoneme convergence: alive sisters in close geographic
 * contact gradually share each other's distinctive phonemes,
 * mirroring real Sprachbund effects (the Caucasus's pharyngealised
 * consonants spreading across unrelated families, the Balkan
 * schwa, retroflex consonants throughout the Indian subcontinent).
 *
 * Mechanism: with low per-gen probability, pick a close-contact
 * sister and find a phoneme it has but we don't. If our lexicon
 * already contains a similar phoneme (same vowel/consonant class),
 * we're a candidate for borrowing it. Substitute the new phoneme
 * into a few words where the contextually-similar phoneme appears.
 * Over many generations the new phoneme becomes a regular
 * inventory member.
 *
 * Distance gating: same as `tryBorrow` — affinity = half / (half + d).
 */

const AREAL_HALF_LIFE = 200;

export interface ArealPhonemeEvent {
  donorId: string;
  donorName: string;
  phoneme: string;
  replacedPhoneme: string;
  affectedMeanings: string[];
}

export function maybeArealPhonemeShare(
  recipient: Language,
  tree: LanguageTree,
  rng: Rng,
  baseProbability: number,
): ArealPhonemeEvent | null {
  if (!recipient.coords) return null;
  const sisters = leafIds(tree)
    .filter(
      (id) =>
        id !== recipient.id &&
        !tree[id]!.language.extinct &&
        !!tree[id]!.language.coords,
    )
    .map((id) => tree[id]!.language);
  if (sisters.length === 0) return null;

  // Pick the closest sister; that's the most likely areal donor.
  let donor: Language | null = null;
  let minDist = Infinity;
  for (const s of sisters) {
    const d = geoDistance(recipient.coords!, s.coords!);
    if (d < minDist) {
      minDist = d;
      donor = s;
    }
  }
  if (!donor) return null;

  // Distance-decayed gate.
  const affinity = AREAL_HALF_LIFE / (AREAL_HALF_LIFE + minDist);
  if (!rng.chance(baseProbability * affinity)) return null;

  // Phonemes the donor has that we don't.
  const ours = new Set(recipient.phonemeInventory.segmental);
  const novel = donor.phonemeInventory.segmental.filter((p) => !ours.has(p));
  if (novel.length === 0) return null;
  const target = novel[rng.int(novel.length)]!;

  // Find one of our phonemes of the same class to replace. We pick a
  // few words where it appears and substitute. If our inventory
  // doesn't have a matching-class candidate, skip — phonemes don't
  // teleport across the vowel/consonant boundary.
  const targetIsVowel = isVowel(target);
  const candidates = recipient.phonemeInventory.segmental.filter(
    (p) => isVowel(p) === targetIsVowel,
  );
  if (candidates.length === 0) return null;
  const replaced = candidates[rng.int(candidates.length)]!;
  if (replaced === target) return null;

  // Apply: substitute `replaced` → `target` in 1-3 random words.
  const meanings = Object.keys(recipient.lexicon).filter((m) =>
    recipient.lexicon[m]!.includes(replaced),
  );
  if (meanings.length === 0) return null;
  const affected: string[] = [];
  const howMany = Math.min(meanings.length, 1 + rng.int(3));
  // Sample without replacement.
  const used = new Set<number>();
  while (affected.length < howMany && used.size < meanings.length) {
    const idx = rng.int(meanings.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const m = meanings[idx]!;
    const form = recipient.lexicon[m]!;
    // Replace the first occurrence of `replaced`.
    const newForm = form.slice();
    for (let i = 0; i < newForm.length; i++) {
      if (newForm[i] === replaced) {
        newForm[i] = target;
        break;
      }
    }
    recipient.lexicon[m] = newForm;
    affected.push(m);
  }
  if (affected.length === 0) return null;

  // Add the new phoneme to the inventory.
  recipient.phonemeInventory.segmental = Array.from(
    new Set([...recipient.phonemeInventory.segmental, target]),
  ).sort();

  return {
    donorId: donor.id,
    donorName: donor.name,
    phoneme: target,
    replacedPhoneme: replaced,
    affectedMeanings: affected,
  };
}
