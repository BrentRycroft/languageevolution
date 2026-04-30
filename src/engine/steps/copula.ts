import type { Language, SimulationConfig } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

export function stepCopulaErosion(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (!lang.lexicon["be"]) return;
  const baseP = config.obsolescence.copulaLossProbability ?? 0.005;
  const p = Math.min(1, baseP / Math.max(0.3, lang.conservatism));
  if (!rng.chance(p)) return;
  const oldForm = lang.lexicon["be"]!.join("");
  delete lang.lexicon["be"];
  delete lang.wordFrequencyHints["be"];
  if (lang.registerOf) delete lang.registerOf["be"];
  delete lang.localNeighbors["be"];
  delete lang.wordOrigin["be"];
  delete lang.lastChangeGeneration["be"];
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
  if (lang.lexicon["be"]) return;
  const baseP = config.obsolescence.copulaGenesisProbability ?? 0.0025;
  const p = Math.min(1, baseP / Math.max(0.3, lang.conservatism));
  if (!rng.chance(p)) return;

  let donor: string | null = null;
  let pathway: string | null = null;
  for (const candidates of COPULA_DONORS) {
    const found = candidates.find((m) => lang.lexicon[m]);
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

  lang.lexicon["be"] = lang.lexicon[donor]!.slice();
  lang.wordOrigin["be"] = `grammaticalization:${pathway}:${donor}`;
  lang.wordFrequencyHints["be"] = 0.95;
  lang.lastChangeGeneration["be"] = generation;

  pushEvent(lang, {
    generation,
    kind: "semantic_drift",
    description: `gained a copula "be" via the ${pathway} pathway — borrowed the form of "${donor}" (/${lang.lexicon[donor]!.join("")}/)`,
  });
}
