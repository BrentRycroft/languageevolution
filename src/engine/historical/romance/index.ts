/**
 * historical/romance/index.ts — Phase 70 T1+T2: Latin → Romance pathway.
 *
 * Pure-data declaration of the Romance historical schedule.
 * T1 shipped M1 (Vulgar Latin lenition burst on the proto).
 * T2 adds M2 (Italo-Western / Eastern Romance split at gen 65).
 * T3 ships the full pathway: Iberian / Gallo / Italo subsplits and
 * the per-daughter idiosyncrasies (Castilian f→h, French nasalisation
 * + uvular ʁ, Italian gemination preservation, Romanian case retention).
 *
 * Plan:
 * /root/.claude/plans/i-want-to-make-modular-quill.md
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
  ],
  terminalNames: {
    castilian: "Spanish",
    lusitanian: "Portuguese",
    francien: "French",
    tuscan: "Italian",
    daco: "Romanian",
  },
};
