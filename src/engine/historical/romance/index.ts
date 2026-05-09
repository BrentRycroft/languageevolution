/**
 * historical/romance/index.ts — Phase 70 T1+T2+T3: Latin → Romance.
 *
 * Pure-data declaration of the Romance historical schedule. The
 * railroad nudges a generic Romance preset run toward the canonical
 * five Romance daughters: Spanish, Portuguese, French, Italian, and
 * Romanian. Soft nudges only — engine still picks stochastically.
 *
 * Schedule outline:
 *   M1  gen  25  bias  proto       Vulgar Latin lenition burst
 *   M2  gen  65  split proto       → western + eastern
 *   M3  gen 100  split western     → iberian + gallo + italo
 *   M4  gen 130  split iberian     → castilian + lusitanian
 *   M5  gen 130  split gallo       → francien + occitano
 *   M6  gen 130  split italo       → tuscan
 *   M7  gen 160  bias  castilian   Spanish characterisation (f→h, nn→ɲ)
 *   M8  gen 165  bias  francien    Old French upheaval (vowel reduction,
 *                                  nasalisation, uvular ʁ)
 *   M9  gen 170  bias  tuscan      Italian gemination retention
 *   M10 gen 170  bias  lusitanian  Portuguese nasalisation
 *
 * Plan: /root/.claude/plans/i-want-to-make-modular-quill.md
 */

import type { HistoricalSchedule } from "../types";

export const romanceSchedule: HistoricalSchedule = {
  id: "romance",
  label: "Latin → Romance daughters",
  description:
    "Vulgar Latin lenition burst as a soft railroad. Future tranches: " +
    "Western/Eastern split, Iberian/Gallo/Italo subsplits, terminal " +
    "Spanish/Italian/French/Portuguese/Romanian.",
  presetId: "romance",
  milestones: [
    // ── M1: Vulgar Latin lenition burst (proto-wide) ────────────
    // Real-history correlate: ~1st-3rd c. CE intervocalic voicing
    // wave that turned Latin /b d g/ medial → /β ð ɣ/, eventually
    // /v 0 0/ across most of the Western Empire. We boost the
    // lenition family bias and trigger a volatility upheaval to
    // multiply phonology rate on the proto for ~18 gens.
    {
      kind: "bias",
      atGen: 25,
      role: "proto",
      label: "Vulgar Latin lenition",
      ruleBias: {
        lenition: 1.8,
        vowel_shift: 1.2,
        deletion: 1.3,
      },
      categoryMomentum: {
        lenition: { boost: 1.5, forGens: 30 },
      },
      volatility: {
        multiplier: 2.8,
        forGens: 18,
        trigger: "Vulgar Latin lenition",
      },
    },
    // ── M2: Italo-Western vs Eastern Romance split ─────────────
    // Real-history correlate: ~3rd-5th c. CE divergence between the
    // Western Empire (Iberia, Gaul, Italia) and Dacia/Balkan Latin
    // that became Romanian. Western branch picks up further lenition;
    // Eastern keeps cases and resists deletion (modelling Romanian's
    // retention of three-case morphology).
    {
      kind: "split",
      atGen: 65,
      parentRole: "proto",
      label: "Italo-Western vs Eastern Romance",
      daughters: [
        {
          role: "western",
          nameHint: "Proto-Western-Romance",
          initialBias: {
            ruleBias: { lenition: 1.7, palatalization: 1.3 },
            categoryMomentum: {
              lenition: { boost: 1.3, forGens: 25 },
            },
          },
        },
        {
          role: "eastern",
          nameHint: "Proto-Eastern-Romance",
          initialBias: {
            // Eastern branch resists erosion → Romanian's case retention.
            ruleBias: { fortition: 1.2, deletion: 0.6 },
          },
        },
      ],
    },
    // ── M3: Western Romance subsplit ───────────────────────────
    // ~5th-7th c. CE: Iberian (→Spanish, Portuguese), Gallo-Romance
    // (→French), Italo-Romance (→Italian) diverge as Roman Empire
    // crumbles. Each branch gets distinct phonological priors.
    {
      kind: "split",
      atGen: 100,
      parentRole: "western",
      label: "Western Romance subsplit",
      daughters: [
        {
          role: "iberian",
          nameHint: "Proto-Iberian-Romance",
          initialBias: {
            ruleBias: { lenition: 1.5, palatalization: 1.2 },
          },
        },
        {
          role: "gallo",
          nameHint: "Proto-Gallo-Romance",
          initialBias: {
            ruleBias: { vowel_shift: 1.6, deletion: 1.4, vowel_reduction: 1.5 },
          },
        },
        {
          role: "italo",
          nameHint: "Proto-Italo-Romance",
          initialBias: {
            // Italian preserves more: lower lenition, stronger fortition
            // for the geminate retention found in modern Italian.
            ruleBias: { lenition: 0.8, fortition: 1.3 },
          },
        },
      ],
    },
    // ── M4: Iberian subsplit ───────────────────────────────────
    {
      kind: "split",
      atGen: 130,
      parentRole: "iberian",
      label: "Iberian subsplit",
      daughters: [
        {
          role: "castilian",
          nameHint: "Old Castilian",
          initialBias: {
            ruleBias: { lenition: 1.3, palatalization: 1.4 },
          },
        },
        {
          role: "lusitanian",
          nameHint: "Old Portuguese",
          initialBias: {
            ruleBias: { vowel_shift: 1.4, deletion: 1.2 },
          },
        },
      ],
    },
    // ── M5: Gallo subsplit ─────────────────────────────────────
    {
      kind: "split",
      atGen: 130,
      parentRole: "gallo",
      label: "Gallo-Romance subsplit",
      daughters: [
        {
          role: "francien",
          nameHint: "Old French",
          initialBias: {
            ruleBias: { vowel_shift: 1.7, deletion: 1.5, vowel_reduction: 1.5 },
          },
        },
        {
          role: "occitano",
          nameHint: "Old Occitan",
          initialBias: {
            ruleBias: { vowel_shift: 1.2 },
          },
        },
      ],
    },
    // ── M6: Italo subsplit ─────────────────────────────────────
    // Italo lineage produces Tuscan (→Standard Italian) as the
    // single high-prestige daughter; other Italian dialects in
    // reality remained as a continuum but we model only the
    // standard outcome.
    {
      kind: "split",
      atGen: 130,
      parentRole: "italo",
      label: "Italo-Romance characterisation",
      daughters: [
        {
          role: "tuscan",
          nameHint: "Old Tuscan",
          initialBias: {
            ruleBias: { fortition: 1.3, lenition: 0.7 },
          },
        },
      ],
    },
    // ── M7: Castilian / Spanish characterisation ───────────────
    // Spanish-defining changes: f→h (later silenced), nn→ɲ, b/v
    // merger. We bias the relevant rule families (palatalization for
    // ɲ, lenition for f→h) without forcing specific rule IDs.
    {
      kind: "bias",
      atGen: 160,
      role: "castilian",
      label: "Castilian / Spanish characterisation",
      ruleBias: {
        lenition: 1.6,         // f→h is a lenition
        palatalization: 1.5,   // nn→ɲ
      },
      categoryMomentum: {
        palatalization: { boost: 1.4, forGens: 20 },
        lenition: { boost: 1.3, forGens: 20 },
      },
      volatility: {
        multiplier: 2.0,
        forGens: 12,
        trigger: "Castilian sound shifts",
      },
    },
    // ── M8: Old French upheaval ────────────────────────────────
    // Aggressive vowel reduction, nasalisation, final-vowel loss,
    // and the late-medieval shift to uvular ʁ. The most dramatic
    // typological change in the Romance family.
    {
      kind: "bias",
      atGen: 165,
      role: "francien",
      label: "Old French vowel reduction + nasalisation",
      ruleBias: {
        vowel_shift: 2.2,
        deletion: 2.0,
        vowel_reduction: 2.0,
        lenition: 1.6,
      },
      categoryMomentum: {
        vowel_shift: { boost: 1.6, forGens: 25 },
        deletion: { boost: 1.5, forGens: 25 },
      },
      volatility: {
        multiplier: 3.5,
        forGens: 25,
        trigger: "Old French upheaval",
      },
    },
    // ── M9: Italian gemination preservation ────────────────────
    // Italian famously preserves Latin geminates (otto, anno,
    // bocca). Boost fortition + suppress lenition further.
    {
      kind: "bias",
      atGen: 170,
      role: "tuscan",
      label: "Italian gemination retention",
      ruleBias: {
        fortition: 1.5,
        lenition: 0.6,
        deletion: 0.7,
      },
      categoryMomentum: {
        fortition: { boost: 1.4, forGens: 20 },
      },
    },
    // ── M10: Portuguese nasalisation ───────────────────────────
    // Portuguese is famous for its nasal vowels, intervocalic /l/
    // and /n/ deletion (luna → lua, pleno → pleno but populus →
    // povo). Bias deletion + vowel_shift heavily.
    {
      kind: "bias",
      atGen: 170,
      role: "lusitanian",
      label: "Portuguese nasalisation + intervocalic deletion",
      ruleBias: {
        vowel_shift: 1.8,
        deletion: 1.7,
      },
      categoryMomentum: {
        vowel_shift: { boost: 1.5, forGens: 20 },
      },
      volatility: {
        multiplier: 2.2,
        forGens: 15,
        trigger: "Portuguese characterisation",
      },
    },
  ],
  terminalNames: {
    castilian: "Spanish",
    lusitanian: "Portuguese",
    francien: "French",
    tuscan: "Italian",
    daco: "Romanian",
  },
};
