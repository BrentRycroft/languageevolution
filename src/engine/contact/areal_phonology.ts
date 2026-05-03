import type { Language, LanguageTree } from "../types";
import type { Rng } from "../rng";
import { leafIds } from "../tree/split";
import { geoDistance } from "../geo";
import { isVowel } from "../phonology/ipa";
import type { WorldMap } from "../geo/map";
import { arealShareAffinity } from "../geo/territory";
import { inventorySizePressure } from "../steps/inventoryManagement";

const AREAL_HALF_LIFE = 200;
// Phase 27.1: gate at ANY positive pressure (i.e. any inventory
// overshoot). Previously 0.5, which let neighbors keep adding phonemes
// to a language already trying to shrink itself back to target.
const AREAL_PRESSURE_GATE = 0.0;

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
  worldMap?: WorldMap,
): ArealPhonemeEvent | null {
  // Phase 27b: gate areal-share when the recipient is already over its
  // tier-target inventory size. Suppresses growth when the homeostatic
  // pressure exceeds AREAL_PRESSURE_GATE — the recipient is already
  // shedding low-load phonemes, no point adding more from neighbors.
  if (inventorySizePressure(recipient) > AREAL_PRESSURE_GATE) return null;
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

  let donor: Language | null = null;
  let bestAffinity = 0;
  for (const s of sisters) {
    let affinity: number;
    if (worldMap && recipient.territory && s.territory) {
      affinity = arealShareAffinity(worldMap, recipient, s);
    } else {
      const d = geoDistance(recipient.coords!, s.coords!);
      affinity = AREAL_HALF_LIFE / (AREAL_HALF_LIFE + d);
    }
    if (affinity > bestAffinity) {
      bestAffinity = affinity;
      donor = s;
    }
  }
  if (!donor) return null;

  if (!rng.chance(baseProbability * bestAffinity)) return null;

  const ours = new Set(recipient.phonemeInventory.segmental);
  const novel = donor.phonemeInventory.segmental.filter((p) => !ours.has(p));
  if (novel.length === 0) return null;
  const target = novel[rng.int(novel.length)]!;

  const targetIsVowel = isVowel(target);
  const candidates = recipient.phonemeInventory.segmental.filter(
    (p) => isVowel(p) === targetIsVowel,
  );
  if (candidates.length === 0) return null;
  const replaced = candidates[rng.int(candidates.length)]!;
  if (replaced === target) return null;

  const meanings = Object.keys(recipient.lexicon).filter((m) =>
    recipient.lexicon[m]!.includes(replaced),
  );
  if (meanings.length === 0) return null;
  const affected: string[] = [];
  const howMany = Math.min(meanings.length, 1 + rng.int(3));
  const used = new Set<number>();
  while (affected.length < howMany && used.size < meanings.length) {
    const idx = rng.int(meanings.length);
    if (used.has(idx)) continue;
    used.add(idx);
    const m = meanings[idx]!;
    const form = recipient.lexicon[m]!;
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

  recipient.phonemeInventory.segmental = Array.from(
    new Set([...recipient.phonemeInventory.segmental, target]),
  ).sort();
  if (!recipient.inventoryProvenance) recipient.inventoryProvenance = {};
  recipient.inventoryProvenance[target] = {
    source: "areal",
    sourceLangId: donor.id,
    sourceLangName: donor.name,
  };

  return {
    donorId: donor.id,
    donorName: donor.name,
    phoneme: target,
    replacedPhoneme: replaced,
    affectedMeanings: affected,
  };
}
