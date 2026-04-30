import type { Language, Phoneme } from "../types";
import type { Rng } from "../rng";
import {
  featuresOf,
  findConsonant,
  shiftHeight,
  type ConsonantFeatures,
  type FeatureQuery,
} from "./features";
import type { GeneratedRule, RuleFamily } from "./generated";
import { phonemesMatching } from "./generated";

interface TemplateProposal {
  family: RuleFamily;
  templateId: string;
  description: string;
  from: FeatureQuery;
  context: GeneratedRule["context"];
  outputMap: Record<string, string>;
}

export interface RuleTemplate {
  id: string;
  family: RuleFamily;
  propose(lang: Language, rng: Rng): TemplateProposal | null;
}

const STOP_TO_FRICATIVE: Record<string, string> = {
  p: "f",
  b: "β",
  t: "θ",
  d: "ð",
  k: "x",
  g: "ɣ",
  q: "x",
};

const FRICATIVE_TO_APPROX: Record<string, string> = {
  f: "h",
  v: "w",
  β: "w",
  θ: "h",
  ð: "j",
  s: "h",
  z: "j",
  ʃ: "h",
  ʒ: "j",
  x: "h",
  ɣ: "j",
};

const VOICELESS_TO_VOICED: Record<string, string> = {
  p: "b",
  t: "d",
  k: "g",
  f: "v",
  θ: "ð",
  s: "z",
  ʃ: "ʒ",
  x: "ɣ",
  tʃ: "dʒ",
  ts: "dz",
};

const VOICED_TO_VOICELESS: Record<string, string> = Object.fromEntries(
  Object.entries(VOICELESS_TO_VOICED).map(([k, v]) => [v, k]),
);

function filterInventory(
  lang: Language,
  map: Record<string, string>,
): Record<string, string> {
  const inv = new Set(lang.phonemeInventory.segmental);
  const out: Record<string, string> = {};
  for (const [from, to] of Object.entries(map)) {
    if (inv.has(from)) out[from] = to;
  }
  return out;
}

const pickOne = <T,>(rng: Rng, arr: readonly T[]): T | undefined =>
  arr.length === 0 ? undefined : arr[rng.int(arr.length)];

const STOP_TO_FRICATIVE_INTERVOCALIC: RuleTemplate = {
  id: "lenition.stops_to_fricatives_intervocalic",
  family: "lenition",
  propose(lang) {
    const map = filterInventory(lang, STOP_TO_FRICATIVE);
    if (Object.keys(map).length < 2) return null;
    return {
      family: "lenition",
      templateId: this.id,
      description: "Stops lenite to fricatives between vowels",
      from: { type: "consonant", manner: "stop" },
      context: { locus: "intervocalic" },
      outputMap: map,
    };
  },
};

const FINAL_DEVOICING: RuleTemplate = {
  id: "fortition.final_devoicing",
  family: "fortition",
  propose(lang) {
    const map = filterInventory(lang, VOICED_TO_VOICELESS);
    const filtered: Record<string, string> = {};
    for (const [from, to] of Object.entries(map)) {
      const f = featuresOf(from);
      if (!f || f.type !== "consonant") continue;
      if (f.manner === "stop" || f.manner === "fricative" || f.manner === "affricate") {
        filtered[from] = to;
      }
    }
    if (Object.keys(filtered).length < 1) return null;
    return {
      family: "fortition",
      templateId: this.id,
      description: "Word-final obstruents devoice",
      from: { type: "consonant", voice: true },
      context: { position: "final" },
      outputMap: filtered,
    };
  },
};

const INTERVOCALIC_VOICING: RuleTemplate = {
  id: "lenition.intervocalic_voicing",
  family: "lenition",
  propose(lang) {
    const map = filterInventory(lang, VOICELESS_TO_VOICED);
    const filtered: Record<string, string> = {};
    for (const [from, to] of Object.entries(map)) {
      const f = featuresOf(from);
      if (!f || f.type !== "consonant") continue;
      if (f.manner === "stop" || f.manner === "fricative" || f.manner === "affricate") {
        filtered[from] = to;
      }
    }
    if (Object.keys(filtered).length < 1) return null;
    return {
      family: "lenition",
      templateId: this.id,
      description: "Voiceless obstruents voice between vowels",
      from: { type: "consonant", voice: false },
      context: { locus: "intervocalic" },
      outputMap: filtered,
    };
  },
};

const FRICATIVES_TO_H: RuleTemplate = {
  id: "lenition.fricatives_to_approximant",
  family: "lenition",
  propose(lang) {
    const map = filterInventory(lang, FRICATIVE_TO_APPROX);
    if (Object.keys(map).length < 1) return null;
    return {
      family: "lenition",
      templateId: this.id,
      description: "Fricatives weaken toward /h/ or /j/",
      from: { type: "consonant", manner: "fricative" },
      context: { locus: "any" },
      outputMap: map,
    };
  },
};

const PALATALIZATION_BEFORE_FRONT: RuleTemplate = {
  id: "palatalization.velars_before_front",
  family: "palatalization",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("k")) map.k = "tʃ";
    if (inv.has("g")) map.g = "dʒ";
    if (inv.has("t")) map.t = "tʃ";
    if (inv.has("d")) map.d = "dʒ";
    if (Object.keys(map).length === 0) return null;
    return {
      family: "palatalization",
      templateId: this.id,
      description: "Velar/alveolar stops palatalise before front vowels",
      from: { type: "consonant", manner: "stop" },
      context: { after: { type: "vowel", backness: "front" } },
      outputMap: map,
    };
  },
};

const VOWEL_RAISING: RuleTemplate = {
  id: "vowel_shift.raising",
  family: "vowel_shift",
  propose(lang) {
    const out: Record<string, string> = {};
    for (const v of lang.phonemeInventory.segmental) {
      const raised = shiftHeight(v, 1);
      if (raised && raised !== v) out[v] = raised;
    }
    if (Object.keys(out).length < 2) return null;
    return {
      family: "vowel_shift",
      templateId: this.id,
      description: "Vowels raise one step",
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: out,
    };
  },
};

const VOWEL_LOWERING: RuleTemplate = {
  id: "vowel_shift.lowering",
  family: "vowel_shift",
  propose(lang) {
    const out: Record<string, string> = {};
    for (const v of lang.phonemeInventory.segmental) {
      const lowered = shiftHeight(v, -1);
      if (lowered && lowered !== v) out[v] = lowered;
    }
    if (Object.keys(out).length < 2) return null;
    return {
      family: "vowel_shift",
      templateId: this.id,
      description: "Vowels lower one step",
      from: { type: "vowel" },
      context: { locus: "any" },
      outputMap: out,
    };
  },
};

const VOWEL_SINGLE_RAISE: RuleTemplate = {
  id: "vowel_shift.single_raise",
  family: "vowel_shift",
  propose(lang, rng) {
    const vowels = lang.phonemeInventory.segmental.filter(
      (p) => featuresOf(p)?.type === "vowel",
    );
    if (vowels.length < 2) return null;
    const shuffled = vowels.slice();
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }
    for (const v of shuffled) {
      const raised = shiftHeight(v, 1);
      if (!raised || raised === v) continue;
      return {
        family: "vowel_shift",
        templateId: this.id,
        description: `/${v}/ raises to /${raised}/`,
        from: { type: "vowel" },
        context: { locus: "any" },
        outputMap: { [v]: raised },
      };
    }
    return null;
  },
};

const SCHWA_REDUCTION: RuleTemplate = {
  id: "vowel_reduction.unstressed_to_schwa",
  family: "vowel_reduction",
  propose(lang) {
    if (!lang.phonemeInventory.segmental.includes("ə")) {
    }
    const out: Record<string, string> = {};
    for (const v of lang.phonemeInventory.segmental) {
      const f = featuresOf(v);
      if (f?.type === "vowel" && v !== "ə") out[v] = "ə";
    }
    if (Object.keys(out).length < 3) return null;
    return {
      family: "vowel_reduction",
      templateId: this.id,
      description: "Non-initial vowels reduce to schwa",
      from: { type: "vowel" },
      context: { position: "medial" },
      outputMap: out,
    };
  },
};

const NASAL_ASSIMILATION: RuleTemplate = {
  id: "place_assim.nasal_place",
  family: "place_assim",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("n")) {
      map.n = "ŋ";
    }
    if (Object.keys(map).length === 0) return null;
    const choice = (lang.id.length + lang.phonemeInventory.segmental.length) % 2;
    if (choice === 0) {
      return {
        family: "place_assim",
        templateId: this.id,
        description: "Nasals assimilate place before velars",
        from: { type: "consonant", manner: "nasal" },
        context: { after: { type: "consonant", place: "velar" } },
        outputMap: { n: "ŋ" },
      };
    }
    return {
      family: "place_assim",
      templateId: this.id,
      description: "Nasals assimilate place before labials",
      from: { type: "consonant", manner: "nasal" },
      context: { after: { type: "consonant", place: "labial" } },
      outputMap: { n: "m" },
    };
  },
};

const FINAL_C_DELETION: RuleTemplate = {
  id: "deletion.final_consonant",
  family: "deletion",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const candidates = ["t", "k", "p"].filter((p) => inv.has(p));
    if (candidates.length === 0) return null;
    const map: Record<string, string> = {};
    for (const p of candidates) map[p] = "";
    return {
      family: "deletion",
      templateId: this.id,
      description: "Word-final voiceless stops delete",
      from: { type: "consonant", manner: "stop", voice: false },
      context: { position: "final" },
      outputMap: map,
    };
  },
};

const H_LOSS: RuleTemplate = {
  id: "deletion.h_loss",
  family: "deletion",
  propose(lang) {
    if (!lang.phonemeInventory.segmental.includes("h")) return null;
    return {
      family: "deletion",
      templateId: this.id,
      description: "/h/ deletes word-initially",
      from: { type: "consonant", manner: "fricative" },
      context: { position: "initial" },
      outputMap: { h: "" },
    };
  },
};

const VOWEL_FRONTING_BEFORE_PALATAL: RuleTemplate = {
  id: "harmony.umlaut_before_i",
  family: "harmony",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    if (!inv.has("i") && !inv.has("j")) return null;
    const map: Record<string, string> = {};
    if (inv.has("u")) map.u = "y";
    if (inv.has("o")) map.o = "ø";
    if (inv.has("a")) map.a = "e";
    if (Object.keys(map).length < 2) return null;
    return {
      family: "harmony",
      templateId: this.id,
      description: "Back vowels front when /i/ or /j/ follows (umlaut)",
      from: { type: "vowel", backness: "back" },
      context: { after: { type: "vowel", height: "high", backness: "front" } },
      outputMap: map,
    };
  },
};

const DEBUCCALIZATION: RuleTemplate = {
  id: "lenition.s_to_h",
  family: "lenition",
  propose(lang) {
    if (!lang.phonemeInventory.segmental.includes("s")) return null;
    return {
      family: "lenition",
      templateId: this.id,
      description: "/s/ debuccalises to /h/ before consonants",
      from: { type: "consonant", place: "alveolar", manner: "fricative" },
      context: { after: { type: "consonant" } },
      outputMap: { s: "h" },
    };
  },
};

const PREGLOTTAL_FINAL_STOP: RuleTemplate = {
  id: "fortition.preglottal_final_stop",
  family: "fortition",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("p")) map.p = "ʔp";
    if (inv.has("t")) map.t = "ʔt";
    if (inv.has("k")) map.k = "ʔk";
    if (Object.keys(map).length === 0) return null;
    return {
      family: "fortition",
      templateId: this.id,
      description: "Word-final voiceless stops gain a glottal onset (preglottalisation)",
      from: { type: "consonant", manner: "stop", voice: false },
      context: { position: "final" },
      outputMap: map,
    };
  },
};

const INITIAL_EJECTIVE: RuleTemplate = {
  id: "fortition.initial_ejective",
  family: "fortition",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("p")) map.p = "pʼ";
    if (inv.has("t")) map.t = "tʼ";
    if (inv.has("k")) map.k = "kʼ";
    if (Object.keys(map).length === 0) return null;
    return {
      family: "fortition",
      templateId: this.id,
      description: "Word-initial voiceless stops become ejectives (glottalic egressive)",
      from: { type: "consonant", manner: "stop", voice: false },
      context: { position: "initial" },
      outputMap: map,
    };
  },
};

const DEBUCCAL_GLOTTAL: RuleTemplate = {
  id: "lenition.glottal_debuccalisation",
  family: "lenition",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const candidates = ["ʔp", "ʔt", "ʔk", "pʼ", "tʼ", "kʼ"];
    const map: Record<string, string> = {};
    for (const c of candidates) {
      if (inv.has(c)) map[c] = "ʔ";
    }
    if (Object.keys(map).length === 0) return null;
    return {
      family: "lenition",
      templateId: this.id,
      description: "Glottalised stops debuccalise to bare /ʔ/",
      from: { type: "consonant", place: "glottal" },
      context: { locus: "any" },
      outputMap: map,
    };
  },
};

const PLACE_SHIFT_CORONAL: RuleTemplate = {
  id: "place_assim.coronal_retraction",
  family: "place_assim",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("t")) map.t = "ʈ";
    if (inv.has("d")) map.d = "ɖ";
    if (Object.keys(map).length === 0) return null;
    return {
      family: "place_assim",
      templateId: this.id,
      description: "Coronals retroflex near back vowels",
      from: { type: "consonant", place: "alveolar", manner: "stop" },
      context: { after: { type: "vowel", backness: "back" } },
      outputMap: map,
    };
  },
};

const VOICING_ASSIM_CLUSTER: RuleTemplate = {
  id: "fortition.voicing_assim",
  family: "fortition",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    for (const [from, to] of Object.entries(VOICED_TO_VOICELESS)) {
      if (inv.has(from)) map[from] = to;
    }
    if (Object.keys(map).length < 1) return null;
    return {
      family: "fortition",
      templateId: this.id,
      description: "Voiced obstruents devoice before voiceless obstruents",
      from: { type: "consonant", voice: true },
      context: { after: { type: "consonant", voice: false } },
      outputMap: map,
    };
  },
};

const CLUSTER_EPENTHESIS_PLACEHOLDER: RuleTemplate = {
  id: "place_assim.labial_to_dental",
  family: "place_assim",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("p") && inv.has("t")) map.p = "t";
    if (inv.has("b") && inv.has("d")) map.b = "d";
    if (Object.keys(map).length === 0) return null;
    return {
      family: "place_assim",
      templateId: this.id,
      description: "Labial stops shift to coronal",
      from: { type: "consonant", place: "labial", manner: "stop" },
      context: { locus: "any" },
      outputMap: map,
    };
  },
};

const VOWEL_ROUNDING: RuleTemplate = {
  id: "vowel_shift.rounding",
  family: "vowel_shift",
  propose(lang) {
    const inv = new Set(lang.phonemeInventory.segmental);
    const map: Record<string, string> = {};
    if (inv.has("a")) map.a = "ɔ";
    if (inv.has("e")) map.e = "ø";
    if (inv.has("i")) map.i = "y";
    if (Object.keys(map).length < 2) return null;
    return {
      family: "vowel_shift",
      templateId: this.id,
      description: "Vowels acquire lip rounding",
      from: { type: "vowel", round: false },
      context: { locus: "any" },
      outputMap: map,
    };
  },
};

export function chainFillConsonant(
  lang: Language,
  empty: ConsonantFeatures,
): Phoneme | undefined {
  const candidates = [
    { ...empty, place: "dental" as const },
    { ...empty, place: "velar" as const },
    { ...empty, manner: "stop" as const },
  ];
  for (const cand of candidates) {
    const p = findConsonant(cand);
    if (p && lang.phonemeInventory.segmental.includes(p)) return p;
  }
  return undefined;
}

export const TEMPLATES: readonly RuleTemplate[] = [
  STOP_TO_FRICATIVE_INTERVOCALIC,
  INTERVOCALIC_VOICING,
  FRICATIVES_TO_H,
  FINAL_DEVOICING,
  PALATALIZATION_BEFORE_FRONT,
  VOWEL_RAISING,
  VOWEL_LOWERING,
  VOWEL_SINGLE_RAISE,
  SCHWA_REDUCTION,
  NASAL_ASSIMILATION,
  PREGLOTTAL_FINAL_STOP,
  INITIAL_EJECTIVE,
  DEBUCCAL_GLOTTAL,
  FINAL_C_DELETION,
  H_LOSS,
  VOWEL_FRONTING_BEFORE_PALATAL,
  DEBUCCALIZATION,
  PLACE_SHIFT_CORONAL,
  VOICING_ASSIM_CLUSTER,
  CLUSTER_EPENTHESIS_PLACEHOLDER,
  VOWEL_ROUNDING,
];

export const TEMPLATES_BY_FAMILY: Record<RuleFamily, RuleTemplate[]> =
  TEMPLATES.reduce(
    (acc, t) => {
      (acc[t.family] ??= []).push(t);
      return acc;
    },
    {} as Record<RuleFamily, RuleTemplate[]>,
  );

export const TEMPLATE_BY_ID: Record<string, RuleTemplate> = Object.fromEntries(
  TEMPLATES.map((t) => [t.id, t]),
);

export { pickOne, phonemesMatching };
