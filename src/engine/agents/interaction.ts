import type { Meaning, Population, WordForm } from "../types";
import type { Rng } from "../rng";
import { derivedConsensus } from "./population";

function perturbSpeech(form: WordForm, innovationProb: number, rng: Rng): WordForm {
  if (!rng.chance(innovationProb)) return form.slice();
  if (form.length === 0) return form.slice();
  const out = form.slice();
  const i = rng.int(out.length);
  const pool = ["e", "a", "i", "o", "u", "t", "s", "n", "r", "l", "k", "m"];
  out[i] = pool[rng.int(pool.length)]!;
  return out;
}

export function runInteractions(pop: Population, rng: Rng): void {
  const n = pop.agents.length;
  if (n < 2) return;
  const meanings = Object.keys(pop.agents[0]!.lexicon);
  if (meanings.length === 0) return;
  for (let i = 0; i < pop.params.interactionsPerStep; i++) {
    const speaker = pop.agents[rng.int(n)]!;
    if (speaker.neighbors.length === 0) continue;
    const listenerId = speaker.neighbors[rng.int(speaker.neighbors.length)]!;
    const listener = pop.agents.find((a) => a.id === listenerId);
    if (!listener) continue;
    const meaning: Meaning = meanings[rng.int(meanings.length)]!;
    const speakerForm = speaker.lexicon[meaning];
    if (!speakerForm) continue;
    const utterance = perturbSpeech(speakerForm, pop.params.innovationProbability, rng);
    if (rng.chance(pop.params.adoptionProbability)) {
      listener.lexicon[meaning] = utterance;
    }
  }
  pop.consensusLexicon = derivedConsensus(pop);
}
