import type { TranslatedToken } from "./sentence";

const IRREGULAR_PAST: Record<string, string> = {
  be: "was",
  have: "had",
  do: "did",
  go: "went",
  say: "said",
  make: "made",
  take: "took",
  see: "saw",
  give: "gave",
  know: "knew",
  come: "came",
  eat: "ate",
  drink: "drank",
  sing: "sang",
  run: "ran",
  find: "found",
  think: "thought",
  bring: "brought",
  buy: "bought",
  catch: "caught",
  teach: "taught",
  fight: "fought",
  hold: "held",
  break: "broke",
  speak: "spoke",
  fall: "fell",
  rise: "rose",
  feel: "felt",
  sleep: "slept",
  hear: "heard",
  stand: "stood",
  cut: "cut",
  put: "put",
  read: "read",
  let: "let",
  set: "set",
  hit: "hit",
};

const IRREGULAR_PLURAL: Record<string, string> = {
  mouse: "mice",
  child: "children",
  foot: "feet",
  tooth: "teeth",
  goose: "geese",
  ox: "oxen",
  man: "men",
  woman: "women",
  person: "people",
};

const IRREGULAR_3SG: Record<string, string> = {
  be: "is",
  have: "has",
  do: "does",
  go: "goes",
  say: "says",
};

const COUNTABLE_NONPLURAL = new Set(["water", "fire", "rain", "snow", "milk", "blood", "wind"]);

function endsWithSibilant(s: string): boolean {
  return /[sxz]$|sh$|ch$/.test(s);
}

function endsWithConsonantY(s: string): boolean {
  return /[^aeiou]y$/.test(s);
}

function pluralOf(lemma: string): string {
  if (IRREGULAR_PLURAL[lemma]) return IRREGULAR_PLURAL[lemma];
  if (COUNTABLE_NONPLURAL.has(lemma)) return lemma;
  if (endsWithSibilant(lemma)) return lemma + "es";
  if (endsWithConsonantY(lemma)) return lemma.slice(0, -1) + "ies";
  return lemma + "s";
}

function pastOf(lemma: string): string {
  if (IRREGULAR_PAST[lemma]) return IRREGULAR_PAST[lemma];
  if (lemma.endsWith("e")) return lemma + "d";
  if (endsWithConsonantY(lemma)) return lemma.slice(0, -1) + "ied";
  return lemma + "ed";
}

function progressiveOf(lemma: string): string {
  if (lemma === "be") return "being";
  if (lemma === "have") return "having";
  if (lemma === "go") return "going";
  if (lemma === "die") return "dying";
  if (lemma === "lie") return "lying";
  if (lemma.endsWith("e") && !lemma.endsWith("ee")) return lemma.slice(0, -1) + "ing";
  return lemma + "ing";
}

function thirdSingularOf(lemma: string): string {
  if (IRREGULAR_3SG[lemma]) return IRREGULAR_3SG[lemma];
  if (endsWithSibilant(lemma)) return lemma + "es";
  if (endsWithConsonantY(lemma)) return lemma.slice(0, -1) + "ies";
  return lemma + "s";
}

function isPunctTag(tag: string): boolean {
  return tag === "PUNCT";
}

function tagOrder(tag: string): number {
  switch (tag) {
    case "DET": return 0;
    case "NUM": return 1;
    case "ADJ": return 2;
    case "N":
    case "PRON":
      return 3;
    case "AUX": return 4;
    case "V": return 5;
    case "ADV": return 6;
    case "PREP": return 7;
    default: return 8;
  }
}

function looksLikeNounPlural(gloss: string): boolean {
  return /pl\b|num\.pl/.test(gloss);
}

function looksLikePast(gloss: string): boolean {
  return /past\b|tense\.past/.test(gloss);
}

function looksLikeProgressive(gloss: string): boolean {
  return /prog\b|aspect\.prog|ipfv/.test(gloss);
}

function looksLike3sg(gloss: string): boolean {
  return /3sg\b|person\.3sg/.test(gloss);
}

export interface ReverseOptions {
  guessTense?: "present" | "past";
  guessAspect?: "progressive" | "perfective" | "imperfective";
  subjectIs3sg?: boolean;
  preserveOrder?: boolean;
}

export function glossToEnglish(
  tokens: TranslatedToken[],
  opts: ReverseOptions = {},
): string {
  const filtered = tokens.filter((t) => !isPunctTag(t.englishTag) || t.englishLemma !== "?");
  if (filtered.length === 0) return "";

  let pastFlag = opts.guessTense === "past";
  let progressiveFlag = opts.guessAspect === "progressive";
  let third = opts.subjectIs3sg ?? false;
  for (const t of filtered) {
    if (looksLikePast(t.glossNote)) pastFlag = true;
    if (looksLikeProgressive(t.glossNote)) progressiveFlag = true;
    if (looksLike3sg(t.glossNote)) third = true;
  }

  const sortable = filtered.map((t, idx) => ({ t, idx }));
  if (!opts.preserveOrder) {
    sortable.sort((a, b) => {
      const ta = tagOrder(a.t.englishTag);
      const tb = tagOrder(b.t.englishTag);
      if (ta !== tb) return ta - tb;
      return a.idx - b.idx;
    });
  }

  const words: string[] = [];
  for (const { t } of sortable) {
    let lemma = t.englishLemma;
    if (lemma.startsWith("CLF:")) continue;
    if (lemma.startsWith("RESUMP:")) continue;
    if (lemma === "Q" || lemma === "?") continue;

    if (t.englishTag === "N" || t.englishTag === "PRON") {
      if (looksLikeNounPlural(t.glossNote)) lemma = pluralOf(lemma);
    } else if (t.englishTag === "V") {
      if (pastFlag) {
        lemma = pastOf(lemma);
      } else if (progressiveFlag) {
        lemma = progressiveOf(lemma);
        words.push(third ? "is" : "are");
      } else if (third) {
        lemma = thirdSingularOf(lemma);
      }
    }
    words.push(lemma);
  }

  return words.join(" ");
}
