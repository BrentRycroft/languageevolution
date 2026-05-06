import type { Language } from "../types";

/**
 * Phase 39k: cross-linguistic numeral formatting.
 *
 * Languages vary dramatically in how they assemble numerals:
 * - English/Spanish/most: decimal, big-small ("fifty-five").
 * - German/Arabic/Dutch: decimal, small-big ("five-and-fifty",
 *   "khamsa wa khamsīn").
 * - French: mixed-decimal-vigesimal (60+10 = soixante-dix; 4×20 =
 *   quatre-vingts; 4×20+10 = quatre-vingt-dix).
 * - Danish: vigesimal-halfsum (50 = half-third × 20 = halvtreds).
 * - Yoruba: subtractive-decimal (45 = "five from fifty", 95 = "ten
 *   from hundred").
 *
 * Render an integer as a sequence of {lemma, connector?} tokens that
 * `realise.ts` can then look up against the language's lexicon.
 */

export interface NumeralToken {
  /** Lemma to look up in the language's lexicon ("five", "twenty"). */
  lemma: string;
  /** Optional connector lemma ("and" for German). */
  connector?: string;
}

const ONES: ReadonlyArray<string> = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
];
const TEENS: ReadonlyArray<string> = [
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen",
  "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS: ReadonlyArray<string> = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];

export function formatNumeral(
  n: number,
  lang: Language,
): NumeralToken[] {
  const base = lang.grammar.numeralBase ?? "decimal";
  const order = lang.grammar.numeralOrder ?? "big-small";
  if (n < 0) n = -n;
  if (n >= 1000) return [{ lemma: String(n) }];

  if (base === "vigesimal") return formatVigesimal(n, order);
  if (base === "subtractive-decimal") return formatSubtractive(n, order);
  if (base === "mixed-decimal-vigesimal") return formatFrench(n, order);
  return formatDecimal(n, order);
}

function formatDecimal(n: number, order: "big-small" | "small-big"): NumeralToken[] {
  if (n === 0) return [{ lemma: ONES[0]! }];
  if (n < 10) return [{ lemma: ONES[n]! }];
  if (n < 20) return [{ lemma: TEENS[n - 10]! }];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    if (ones === 0) return [{ lemma: TENS[tens]! }];
    if (order === "small-big") {
      return [{ lemma: ONES[ones]!, connector: "and" }, { lemma: TENS[tens]! }];
    }
    return [{ lemma: TENS[tens]! }, { lemma: ONES[ones]! }];
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const head: NumeralToken[] = [{ lemma: ONES[hundreds]! }, { lemma: "hundred" }];
  if (rest === 0) return head;
  return [...head, ...formatDecimal(rest, order)];
}

function formatFrench(n: number, order: "big-small" | "small-big"): NumeralToken[] {
  if (n < 70) return formatDecimal(n, order);
  if (n < 80) {
    const teen = n - 60;
    return [{ lemma: TENS[6]! }, { lemma: teen < 10 ? ONES[teen]! : TEENS[teen - 10]! }];
  }
  if (n < 100) {
    const rest = n - 80;
    const head: NumeralToken[] = [{ lemma: "four" }, { lemma: "twenty" }];
    if (rest === 0) return head;
    if (rest < 10) return [...head, { lemma: ONES[rest]! }];
    return [...head, { lemma: TEENS[rest - 10]! }];
  }
  return formatDecimal(n, order);
}

function formatVigesimal(n: number, order: "big-small" | "small-big"): NumeralToken[] {
  if (n < 20) return formatDecimal(n, order);
  if (n < 400) {
    const twenties = Math.floor(n / 20);
    const rest = n % 20;
    const head: NumeralToken[] = [{ lemma: ONES[twenties] ?? String(twenties) }, { lemma: "twenty" }];
    if (rest === 0) return head;
    return [...head, ...formatDecimal(rest, order)];
  }
  return [{ lemma: String(n) }];
}

function formatSubtractive(n: number, order: "big-small" | "small-big"): NumeralToken[] {
  if (n < 20) return formatDecimal(n, order);
  // Yoruba subtracts 1-5 from the next round-ten (45 = 5 less than 50,
  // 46 = 4 less than 50, etc.). Numbers ending 0-4 use the lower
  // decade additively.
  if (n % 10 >= 5) {
    const upper = Math.ceil(n / 10) * 10;
    const diff = upper - n;
    if (diff === 0) return formatDecimal(n, order);
    return [
      { lemma: ONES[diff]! },
      { lemma: "from" },
      ...formatDecimal(upper, order),
    ];
  }
  return formatDecimal(n, order);
}

/** Phase 39k: convenience for tests/UI — produce a debug string for a number. */
export function describeNumeral(n: number, lang: Language): string {
  const tokens = formatNumeral(n, lang);
  return tokens.map((t) => (t.connector ? `${t.lemma}-${t.connector}` : t.lemma)).join(" ");
}

