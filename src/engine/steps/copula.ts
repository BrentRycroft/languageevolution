import type { Language, SimulationConfig } from "../types";
import { satSet } from "../lexicon/satellites";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";
import { deleteMeaning, setLexiconForm } from "../lexicon/mutate";
import { idForGloss, lexFormById, lexHasById } from "../lexicon/access";

/**
 * copula.ts
 *
 * Per-generation step orchestrators called from simulation.ts (one file per major substep). Key exports: stepCopulaErosion, stepCopulaGenesis.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function stepCopulaErosion(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (!lexHasById(lang, idForGloss(lang, "be"))) return;
  const baseP = config.obsolescence.copulaLossProbability ?? 0.005;
  const p = Math.min(1, baseP / Math.max(0.3, lang.conservatism));
  if (!rng.chance(p)) return;
  const oldForm = lexFormById(lang, idForGloss(lang, "be")!)!.join("");
  // Phase 29 Tranche 1 round 2: route through chokepoint.
  // `force`: copula erosion is a DELIBERATE, modeled loss (→ zero-copula
  // language), so it must bypass the PROTECTED_MEANINGS guard that
  // otherwise (since Phase 71b) keeps "be" un-deletable and silently
  // turned this whole step into a no-op.
  deleteMeaning(lang, "be", { force: true, reason: "copula-erosion", generation });
  pushEvent(lang, {
    generation,
    kind: "semantic_drift",
    description: `lost the copula "be" (was /${oldForm}/) — equational sentences now drop the verb`,
  });
}

const COPULA_DONORS: ReadonlyArray<readonly string[]> = [
  ["this", "that"],
  ["he", "she", "it"],
  ["stand", "sit", "stay"],
  ["live", "exist"],
];

export function stepCopulaGenesis(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (lexHasById(lang, idForGloss(lang, "be"))) return;
  const baseP = config.obsolescence.copulaGenesisProbability ?? 0.0025;
  const p = Math.min(1, baseP / Math.max(0.3, lang.conservatism));
  if (!rng.chance(p)) return;

  let donor: string | null = null;
  let pathway: string | null = null;
  for (const candidates of COPULA_DONORS) {
    const found = candidates.find((m) => lexHasById(lang, idForGloss(lang, m)));
    if (found) {
      donor = found;
      pathway =
        candidates === COPULA_DONORS[0] ? "demonstrative" :
        candidates === COPULA_DONORS[1] ? "pronoun" :
        candidates === COPULA_DONORS[2] ? "posture-verb" :
        "locative-verb";
      break;
    }
  }
  if (!donor || !pathway) return;

  const donorId = idForGloss(lang, donor)!;
  const donorForm = lexFormById(lang, donorId)!;
  // Phase 29 Tranche 1 round 2: route through chokepoint.
  setLexiconForm(lang, "be", donorForm.slice(), {
    bornGeneration: 0,
    origin: `grammaticalization:${pathway}:${donor}`,
  });
  satSet(lang, "wordOrigin", "be", `grammaticalization:${pathway}:${donor}`);
  satSet(lang, "wordFrequencyHints", "be", 0.95);
  satSet(lang, "lastChangeGeneration", "be", generation);

  pushEvent(lang, {
    generation,
    kind: "semantic_drift",
    description: `gained a copula "be" via the ${pathway} pathway — borrowed the form of "${donor}" (/${donorForm.join("")}/)`,
  });
}
