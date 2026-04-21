import type { Agent, AgentParams, Lexicon, Meaning, Population, WordForm } from "../types";
import type { Rng } from "../rng";

function cloneLexicon(lex: Lexicon): Lexicon {
  const out: Lexicon = {};
  for (const m of Object.keys(lex)) out[m] = lex[m]!.slice();
  return out;
}

function perturbForm(form: WordForm, innovationProb: number, rng: Rng): WordForm {
  if (!rng.chance(innovationProb)) return form.slice();
  if (form.length === 0) return form.slice();
  const out = form.slice();
  const i = rng.int(out.length);
  const pool = ["e", "a", "i", "o", "u", "t", "s", "n", "r", "l"];
  out[i] = pool[rng.int(pool.length)]!;
  return out;
}

export function createPopulation(
  seedLexicon: Lexicon,
  params: AgentParams,
  size: number,
  gridWidth: number,
  idPrefix: string,
  rng: Rng,
): Population {
  const agents: Agent[] = [];
  for (let i = 0; i < size; i++) {
    const lex: Lexicon = {};
    for (const m of Object.keys(seedLexicon)) {
      lex[m] = perturbForm(seedLexicon[m]!, params.innovationProbability * 0.5, rng);
    }
    agents.push({ id: `${idPrefix}-a${i}`, lexicon: lex, neighbors: [] });
  }
  const width = Math.max(1, gridWidth);
  const height = Math.ceil(size / width);
  for (let i = 0; i < size; i++) {
    const x = i % width;
    const y = Math.floor(i / width);
    const neighbors: string[] = [];
    const addNeighbor = (nx: number, ny: number) => {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) return;
      const idx = ny * width + nx;
      if (idx >= agents.length || idx === i) return;
      neighbors.push(agents[idx]!.id);
    };
    addNeighbor(x - 1, y);
    addNeighbor(x + 1, y);
    addNeighbor(x, y - 1);
    addNeighbor(x, y + 1);
    agents[i]!.neighbors = neighbors;
  }
  return {
    agents,
    consensusLexicon: cloneLexicon(seedLexicon),
    params,
    gridWidth: width,
  };
}

export function derivedConsensus(pop: Population): Lexicon {
  const meanings = Object.keys(pop.agents[0]?.lexicon ?? {});
  const out: Lexicon = {};
  for (const m of meanings) {
    const counts = new Map<string, { form: WordForm; count: number }>();
    for (const a of pop.agents) {
      const form = a.lexicon[m];
      if (!form) continue;
      const key = form.join("");
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { form, count: 1 });
    }
    let best: WordForm | undefined;
    let bestCount = -1;
    let bestKey = "";
    for (const [k, v] of counts) {
      if (v.count > bestCount || (v.count === bestCount && k < bestKey)) {
        best = v.form;
        bestCount = v.count;
        bestKey = k;
      }
    }
    if (best) out[m] = best.slice();
  }
  return out;
}

export function resyncAgentsToLexicon(
  pop: Population,
  targetLexicon: Lexicon,
  rng: Rng,
): void {
  for (const a of pop.agents) {
    for (const m of Object.keys(targetLexicon)) {
      a.lexicon[m] = perturbForm(targetLexicon[m]!, pop.params.innovationProbability * 0.3, rng);
    }
  }
  pop.consensusLexicon = cloneLexicon(targetLexicon);
}

export function agentAgreementPercent(pop: Population, meaning: Meaning): number {
  const target = pop.consensusLexicon[meaning];
  if (!target) return 0;
  const targetKey = target.join("");
  let match = 0;
  for (const a of pop.agents) {
    const form = a.lexicon[meaning];
    if (form && form.join("") === targetKey) match++;
  }
  return pop.agents.length === 0 ? 0 : match / pop.agents.length;
}

export function clonePopulation(pop: Population, newIdPrefix: string): Population {
  const idMap = new Map<string, string>();
  pop.agents.forEach((a, i) => idMap.set(a.id, `${newIdPrefix}-a${i}`));
  const agents: Agent[] = pop.agents.map((a) => ({
    id: idMap.get(a.id)!,
    lexicon: cloneLexicon(a.lexicon),
    neighbors: a.neighbors.map((nid) => idMap.get(nid) ?? nid),
  }));
  return {
    agents,
    consensusLexicon: cloneLexicon(pop.consensusLexicon),
    params: { ...pop.params },
    gridWidth: pop.gridWidth,
  };
}
