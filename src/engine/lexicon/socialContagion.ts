import type { Language, Meaning, WordForm } from "../types";

const NEW_VARIANT_FRACTION = 0.05;
const CONTAGION_RATE = 0.18;
const SOCIAL_NOISE_RANGE = 0.04;
const ACTUATION_THRESHOLD = 0.5;
const MIN_GENS_BEFORE_ACTUATION = 2;

function formsEqual(a: WordForm, b: WordForm): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Record an innovation in the lang.variants tracker. Called by phonology /
 * learner / etc. AFTER they have already mutated `lang.lexicon[meaning]`
 * to `newForm`. Because the canonical lexicon has ALREADY swapped, the
 * new form is the dominant variant in the speech community at this
 * moment, and the old form is the residual minority. Earlier versions
 * had this inverted (NEW=5%, OLD=95%), which made stepSocialContagion
 * revert virtually every sound change within 2-3 generations of being
 * applied — the divergence-killer Phase 23 was created to fix.
 */
export function recordInnovation(
  lang: Language,
  meaning: Meaning,
  oldForm: WordForm | undefined,
  newForm: WordForm,
  generation: number,
  innovator: NonNullable<import("../types").FormVariant["innovator"]>,
): void {
  if (!lang.variants) lang.variants = {};
  const existing = lang.variants[meaning] ?? [];
  const oldKey = oldForm ? oldForm.slice() : null;

  // Phase 23: the canonical was just swapped to newForm; reflect that
  // in the adoption-fraction model so contagion doesn't fight phonology.
  const RESIDUAL = NEW_VARIANT_FRACTION; // 0.05 — old form's residual share
  const DOMINANT = 1 - NEW_VARIANT_FRACTION; // 0.95 — new (canonical) form's share

  if (oldKey) {
    const oldEntry = existing.find((v) => formsEqual(v.form, oldKey));
    if (oldEntry) {
      oldEntry.adoptionFraction = RESIDUAL;
    } else {
      existing.push({
        form: oldKey,
        weight: 1,
        bornGeneration: generation - 1,
        adoptionFraction: RESIDUAL,
      });
    }
  }

  const innovationEntry = existing.find((v) => formsEqual(v.form, newForm));
  if (innovationEntry) {
    innovationEntry.adoptionFraction = DOMINANT;
    innovationEntry.weight = Math.max(innovationEntry.weight, DOMINANT);
    if (innovator) innovationEntry.innovator = innovator;
  } else {
    existing.push({
      form: newForm.slice(),
      weight: DOMINANT,
      bornGeneration: generation,
      adoptionFraction: DOMINANT,
      innovator,
    });
  }
  normaliseFractions(existing);
  lang.variants[meaning] = existing;
}

function normaliseFractions(list: import("../types").FormVariant[]): void {
  let total = 0;
  for (const v of list) total += v.adoptionFraction ?? 0;
  if (total <= 0) {
    for (const v of list) v.adoptionFraction = 1 / list.length;
    return;
  }
  for (const v of list) v.adoptionFraction = (v.adoptionFraction ?? 0) / total;
}

export interface SociolinguisticActuation {
  meaning: Meaning;
  fromForm: WordForm;
  toForm: WordForm;
  finalAdoption: number;
  innovator?: NonNullable<import("../types").FormVariant["innovator"]>;
}

export function stepSocialContagion(
  lang: Language,
  generation: number,
  rng: { next: () => number },
): SociolinguisticActuation[] {
  if (!lang.variants) return [];
  const actuations: SociolinguisticActuation[] = [];
  const clustering = lang.socialNetworkClustering ?? 0.7;
  const speakerN = Math.max(50, lang.speakers ?? 1000);
  const noiseScale = SOCIAL_NOISE_RANGE / Math.sqrt(speakerN / 1000);

  for (const m of Object.keys(lang.variants)) {
    const list = lang.variants[m]!;
    if (list.length === 0) continue;

    let fractionsSet = false;
    let totalFrac = 0;
    for (const v of list) {
      if (typeof v.adoptionFraction === "number") {
        fractionsSet = true;
        totalFrac += v.adoptionFraction;
      }
    }
    if (!fractionsSet) {
      let totalW = 0;
      for (const v of list) totalW += v.weight;
      for (const v of list) v.adoptionFraction = totalW > 0 ? v.weight / totalW : 1 / list.length;
    } else if (totalFrac > 0 && Math.abs(totalFrac - 1) > 0.05) {
      for (const v of list) v.adoptionFraction = (v.adoptionFraction ?? 0) / totalFrac;
    }

    const canonical = lang.lexicon[m];
    let leader = list[0]!;
    let leaderFrac = leader.adoptionFraction ?? 0;
    for (const v of list) {
      if ((v.adoptionFraction ?? 0) > leaderFrac) {
        leader = v;
        leaderFrac = v.adoptionFraction ?? 0;
      }
    }

    for (const v of list) {
      const cur = v.adoptionFraction ?? 0;
      const isLeader = v === leader;
      const pull = isLeader ? CONTAGION_RATE * clustering : -CONTAGION_RATE * clustering * (cur / Math.max(1e-6, 1 - leaderFrac));
      const drift = (rng.next() - 0.5) * 2 * noiseScale;
      const next = Math.max(0, Math.min(1, cur + pull * cur * (1 - cur) + drift));
      v.adoptionFraction = next;
    }

    let s = 0;
    for (const v of list) s += v.adoptionFraction ?? 0;
    if (s > 0) {
      for (const v of list) v.adoptionFraction = (v.adoptionFraction ?? 0) / s;
    }

    list.sort((a, b) => (b.adoptionFraction ?? 0) - (a.adoptionFraction ?? 0));
    const top = list[0]!;
    const topFrac = top.adoptionFraction ?? 0;
    if (
      canonical &&
      !formsEqual(top.form, canonical) &&
      topFrac >= ACTUATION_THRESHOLD &&
      generation - top.bornGeneration >= MIN_GENS_BEFORE_ACTUATION
    ) {
      actuations.push({
        meaning: m,
        fromForm: canonical.slice(),
        toForm: top.form.slice(),
        finalAdoption: topFrac,
        innovator: top.innovator,
      });
      lang.lexicon[m] = top.form.slice();
    }

    const survivors = list.filter((v) => (v.adoptionFraction ?? 0) >= 0.02);
    if (survivors.length === 0) {
      delete lang.variants[m];
    } else {
      lang.variants[m] = survivors;
    }
  }
  if (Object.keys(lang.variants).length === 0) delete lang.variants;
  return actuations;
}
