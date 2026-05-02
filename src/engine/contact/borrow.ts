import type { Language, LanguageTree, WordForm } from "../types";
import type { Rng } from "../rng";
import { leafIds } from "../tree/split";
import { isVowel, isSyllabic } from "../phonology/ipa";
import { isFormLegal } from "../phonology/wordShape";
import { addAlt } from "../lexicon/altForms";
import { stripTone } from "../phonology/tone";
import { geoDistance } from "../geo";
import type { WorldMap } from "../geo/map";
import { arealShareAffinity } from "../geo/territory";
import { clusterOf } from "../semantics/clusters";

const MAX_CONSONANT_RUN = 2;
const PREFERRED_EPENTHETIC = ["a", "i", "u", "e", "o", "ə"];

const CLUSTER_BORROW_BIAS: Record<string, number> = {
  tools: 3.5,
  food: 3.0,
  clothing: 2.6,
  abstract: 2.4,
  time: 2.0,
  numbers: 1.8,
  plants: 1.4,
  animals: 1.3,
  environment: 1.0,
  action: 0.8,
  metabolism: 0.7,
  perception: 0.6,
  quality: 0.5,
  motion: 0.4,
  spatial: 0.4,
  kinship: 0.35,
  body: 0.25,
  pronoun: 0.05,
};

const TIER_LOAN_BOOST: Record<string, number> = {
  tools: 1.6,
  abstract: 1.6,
  food: 1.3,
  clothing: 1.3,
  time: 1.3,
  numbers: 1.3,
};

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
  const bilingualLinks = recipient.bilingualLinks;
  const weighted: Array<{ id: string; weight: number }> = donors.map((id) => {
    const donor = tree[id]!.language;
    const bilingual = bilingualLinks?.[id];
    if (typeof bilingual === "number" && bilingual > 0) {
      return { id, weight: 0.05 + bilingual * 1.5 };
    }
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
  const tierGap = (donor.culturalTier ?? 0) - (recipient.culturalTier ?? 0);
  const meaning = pickMeaningByDomain(pool, tierGap, rng);
  const originalForm = donor.lexicon[meaning]!;
  const substituted = adaptPhonemes(originalForm, recipient, rng);
  const adapted = repairLoanShape(substituted, recipient);
  if (adapted.length === 0) return null;
  if (!isFormLegal(meaning, adapted)) return null;
  const donorPop = donor.speakers ?? 10000;
  const recipPop = recipient.speakers ?? 10000;
  const prestige: "high" | "low" = donorPop > recipPop * 2 ? "high" : "low";
  // If the recipient already has a native form for this meaning, the
  // borrowed form joins as a register-tagged alternate (cf. real-world
  // doublets like sheep/mutton, ask/inquire). Otherwise it takes the
  // primary slot.
  const alreadyHas = !!recipient.lexicon[meaning];
  if (alreadyHas) {
    addAlt(recipient, meaning, adapted, prestige);
  } else {
    recipient.lexicon[meaning] = adapted;
  }
  if (!recipient.registerOf) recipient.registerOf = {};
  if (!alreadyHas) recipient.registerOf[meaning] = prestige;
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

function pickMeaningByDomain(pool: string[], tierGap: number, rng: Rng): string {
  const weights: number[] = [];
  let total = 0;
  for (const m of pool) {
    const cluster = clusterOf(m);
    let w = cluster ? (CLUSTER_BORROW_BIAS[cluster] ?? 0.6) : 0.6;
    if (tierGap > 0 && cluster && TIER_LOAN_BOOST[cluster]) {
      w *= TIER_LOAN_BOOST[cluster] ** Math.min(2, tierGap);
    }
    weights.push(w);
    total += w;
  }
  if (total <= 0) return pool[rng.int(pool.length)]!;
  let r = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return pool[i]!;
  }
  return pool[pool.length - 1]!;
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

function pickEpentheticVowel(recipient: Language): string {
  const inv = recipient.phonemeInventory.segmental;
  for (const v of PREFERRED_EPENTHETIC) if (inv.includes(v)) return v;
  for (const p of inv) if (isVowel(p)) return p;
  return "a";
}

function isNonSyllabic(p: string): boolean {
  const base = stripTone(p);
  return !isVowel(base) && !isSyllabic(base);
}

function repairLoanShape(form: WordForm, recipient: Language): WordForm {
  if (form.length === 0) return form;
  const epenthetic = pickEpentheticVowel(recipient);
  const out: string[] = [];
  let consRun = 0;
  for (const p of form) {
    if (isNonSyllabic(p)) {
      consRun++;
      if (consRun > MAX_CONSONANT_RUN) {
        out.push(epenthetic);
        consRun = 1;
      }
      out.push(p);
    } else {
      consRun = 0;
      out.push(p);
    }
  }
  let trailing = 0;
  for (let i = out.length - 1; i >= 0 && isNonSyllabic(out[i]!); i--) trailing++;
  if (trailing >= 2) out.push(epenthetic);
  if (out.length > 0 && !out.some((p) => !isNonSyllabic(p))) {
    out.push(epenthetic);
  }
  return out;
}
