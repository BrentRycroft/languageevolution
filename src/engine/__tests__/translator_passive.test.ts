import { describe, it, expect } from "vitest";
import { createSimulation } from "../simulation";
import { presetBantu } from "../presets/bantu";
import { presetRomance } from "../presets/romance";
import { presetPIE } from "../presets/pie";
import { tokeniseEnglish, translateSentence, type TranslatedToken } from "../translator/sentence";
import { parseSyntaxAllAsClauses } from "../translator/parse";
import type { Language } from "../types";

/**
 * translator_passive.test.ts
 *
 * Passive voice in the English→target translator. A passive REMAPS
 * grammatical relations (Relational Grammar 2→1 advancement): the
 * underlying OBJECT is promoted to surface subject (patient promotion)
 * and the underlying AGENT is demoted to an oblique "by"-phrase chômeur.
 * The transform is language-agnostic — it operates on semantic roles,
 * not on any one language's surface form. These assertions run across an
 * SOV preset (PIE) and two SVO presets (Bantu, Romance).
 */

function protoOf(build: () => ReturnType<typeof presetBantu>, seed: string): Language {
  return createSimulation({ ...build(), seed }).getState().tree["L-0"]!.language;
}
const idxOf = (toks: TranslatedToken[], lemma: string): number =>
  toks.findIndex((t) => t.englishLemma === lemma);
const surface = (toks: TranslatedToken[]): string =>
  toks.map((t) => t.englishLemma).join(" ");

const PRESETS = [
  ["pie", presetPIE],
  ["bantu", presetBantu],
  ["romance", presetRomance],
] as const;

describe("translator passive: patient promotion + agent demotion (language-agnostic IR)", () => {
  it("agentless passive 'the bread is eaten' promotes the patient to subject role", () => {
    const clause = parseSyntaxAllAsClauses(tokeniseEnglish("the bread is eaten"))[0]!;
    expect(clause.predicate.features?.voice, "verb marked passive").toBe("passive");
    const cores = clause.participants.filter((p) => !p.adjunct);
    // Exactly one core argument (the promoted patient); no agent expressed.
    expect(cores).toHaveLength(1);
    expect(cores[0]!.lemma).toBe("bread");
    // 'eat' has the default ["agent","patient"] frame → object role is "patient".
    // Active voice would have labelled the leftmost NP "agent"; the passive
    // promotes the patient into the subject slot, so the role must be "patient".
    expect(cores[0]!.role, "promoted subject carries the patient role, not agent").toBe("patient");
  });

  it("by-agent passive 'the wolf is seen by the king' promotes patient and demotes agent to oblique", () => {
    const clause = parseSyntaxAllAsClauses(tokeniseEnglish("the wolf is seen by the king"))[0]!;
    expect(clause.predicate.features?.voice).toBe("passive");
    const cores = clause.participants.filter((p) => !p.adjunct);
    const adjuncts = clause.participants.filter((p) => p.adjunct);
    // Patient ('wolf') promoted to the single core/subject. 'see' is a psych
    // predicate (experiencer/stimulus); its object role is "stimulus".
    expect(cores).toHaveLength(1);
    expect(cores[0]!.lemma).toBe("wolf");
    expect(cores[0]!.role, "promoted subject is the stimulus (object role of 'see')").toBe("stimulus");
    // Agent ('king') demoted to an oblique by-phrase tagged with the agent role.
    const agent = adjuncts.find((p) => p.lemma === "king");
    expect(agent, "agent demoted to an oblique, not dropped").toBeDefined();
    expect(agent!.role, "demoted by-phrase carries the agent role").toBe("agent");
    expect(agent!.preposition).toBe("by");
  });
});

describe("translator passive: surface realisation across typologies", () => {
  for (const [name, build] of PRESETS) {
    it(`${name}: patient surfaces as subject, agent kept oblique, verb present (nothing dropped)`, () => {
      const lang = protoOf(build, `passive-${name}`);

      // Agentless passive — the patient and the verb must both surface.
      const agentless = translateSentence(lang, "the bread is eaten").targetTokens;
      expect(idxOf(agentless, "bread"), `${name}: patient 'bread' surfaces ("${surface(agentless)}")`).toBeGreaterThanOrEqual(0);
      expect(idxOf(agentless, "eat"), `${name}: verb 'eat' surfaces ("${surface(agentless)}")`).toBeGreaterThanOrEqual(0);

      // By-agent passive — patient is the subject (precedes the verb in these
      // S-initial presets), the agent is still expressed (not silently dropped),
      // and the verb is present.
      const byAgent = translateSentence(lang, "the wolf is seen by the king").targetTokens;
      const patient = idxOf(byAgent, "wolf");
      const verb = idxOf(byAgent, "see");
      const agent = idxOf(byAgent, "king");
      expect(patient, `${name}: patient 'wolf' surfaces ("${surface(byAgent)}")`).toBeGreaterThanOrEqual(0);
      expect(verb, `${name}: verb 'see' surfaces ("${surface(byAgent)}")`).toBeGreaterThanOrEqual(0);
      expect(agent, `${name}: demoted agent 'king' not dropped ("${surface(byAgent)}")`).toBeGreaterThanOrEqual(0);
      // Patient is the grammatical subject: in every preset here the subject is
      // clause-initial, so the patient precedes the verb.
      expect(patient, `${name}: patient-subject precedes verb ("${surface(byAgent)}")`).toBeLessThan(verb);
    });
  }

  it("verb carries the language's passive morphology when a paradigm exists", () => {
    // Presets ship no verb.voice.pass paradigm, so add one and confirm the
    // realiser applies it off the parsed voice=passive feature (typology-driven
    // voice marking, not English structure).
    const lang = protoOf(presetRomance, "passive-morph");
    lang.morphology.paradigms["verb.voice.pass"] = {
      affix: ["u", "s"], position: "suffix", category: "verb.voice.pass",
    };
    const v = translateSentence(lang, "the king was seen").targetTokens.find((t) => t.englishLemma === "see");
    expect(v?.targetSurface, "passive suffix attached to the verb").toContain("us");
  });
});
