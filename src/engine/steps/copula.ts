import type { Language, SimulationConfig } from "../types";
import type { Rng } from "../rng";
import { pushEvent } from "./helpers";

/**
 * Copula erosion: a small per-generation chance that the language
 * drops its `be` lexeme. Models a well-attested grammaticalisation
 * pathway — the Slavic branch of Indo-European retained a full PIE
 * copula paradigm into Old Church Slavonic, then progressively shed
 * the present-tense forms over the course of a few millennia, ending
 * at modern Russian's zero-copula equational sentences ("я студент"
 * — "I [am] student").
 *
 * Once `be` is gone, the translator's zero-copula path takes over:
 * subject + complement carry the equational meaning; negation
 * surfaces as a standalone NEG token. So the same proto can give
 * rise to copula-keeping and copula-losing daughters across a tree.
 *
 * The reverse pathway — copula genesis from a posture verb, locative
 * verb, demonstrative, or pronoun — is handled by
 * `stepCopulaGenesis` below.
 */
export function stepCopulaErosion(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (!lang.lexicon["be"]) return;
  const baseP = config.obsolescence.copulaLossProbability ?? 0.005;
  // Innovative languages (low conservatism) shed the copula faster.
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

/**
 * Copula genesis: a zero-copula language can develop a new copula
 * by grammaticalisation. Cross-linguistically the donors are a small
 * canonical set:
 *
 *  - demonstratives ("this", "that") — Mandarin 是 ← Old Chinese
 *    demonstrative ("this is X" → "X is X" → "X is X.COPULA")
 *  - 3rd-person pronouns — Hebrew הוא, Egyptian Arabic huwwa
 *  - posture verbs (stand, sit, stay, exist) — many Caribbean
 *    creoles, several Bantu languages
 *  - locative verbs (be at, exist) — Spanish estar < stare
 *
 * We sample a donor from whichever of these the language already has,
 * copy its form into a new `be` slot (preserving the donor's original
 * meaning so it now serves both roles, classic polysemy), and tag
 * the wordOrigin so the user can trace the pathway in the events log.
 */
const COPULA_DONORS: ReadonlyArray<readonly string[]> = [
  ["this", "that"],          // demonstrative pathway (Mandarin 是)
  ["he", "she", "it"],       // pronoun pathway (Hebrew הוא)
  ["stand", "sit", "stay"],  // posture-verb pathway (creoles, Bantu)
  ["live", "exist"],         // locative-verb pathway (Spanish estar)
];

export function stepCopulaGenesis(
  lang: Language,
  config: SimulationConfig,
  rng: Rng,
  generation: number,
): void {
  if (lang.lexicon["be"]) return;
  const baseP = config.obsolescence.copulaGenesisProbability ?? 0.0025;
  // Conservative languages innovate slower (mirrors erosion gating).
  const p = Math.min(1, baseP / Math.max(0.3, lang.conservatism));
  if (!rng.chance(p)) return;

  // Pick the first donor pathway with a viable lemma in the lexicon,
  // walking the canonical pathways in order.
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

  // Copy the donor's form into the new `be` slot. The donor keeps
  // its own slot (polysemy) — "shi" still means "this" while ALSO
  // serving as the copula.
  lang.lexicon["be"] = lang.lexicon[donor]!.slice();
  lang.wordOrigin["be"] = `grammaticalization:${pathway}:${donor}`;
  lang.wordFrequencyHints["be"] = 0.95; // copulas are very high-frequency
  lang.lastChangeGeneration["be"] = generation;

  pushEvent(lang, {
    generation,
    kind: "semantic_drift",
    description: `gained a copula "be" via the ${pathway} pathway — borrowed the form of "${donor}" (/${lang.lexicon[donor]!.join("")}/)`,
  });
}
