/**
 * index.ts
 *
 * Word-coinage mechanisms (compound, derivation, conversion, clipping, ideophone, calque, blending, reduplication). Key exports: MECHANISMS.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export type { CoinageMechanism } from "./types";

import type { CoinageMechanism } from "./types";
import { MECHANISM_COMPOUND } from "./compound";
import { MECHANISM_DERIVATION } from "./derivation";
import { MECHANISM_REDUPLICATION } from "./reduplication";
import { MECHANISM_CALQUE } from "./calque";
import { MECHANISM_CLIPPING } from "./clipping";
import { MECHANISM_BLENDING } from "./blending";
import { MECHANISM_IDEOPHONE } from "./ideophone";
import { MECHANISM_CONVERSION } from "./conversion";
import { MECHANISM_TEMPLATE } from "./template";

export const MECHANISMS: readonly CoinageMechanism[] = [
  MECHANISM_COMPOUND,
  MECHANISM_DERIVATION,
  MECHANISM_REDUPLICATION,
  MECHANISM_CALQUE,
  MECHANISM_CLIPPING,
  MECHANISM_BLENDING,
  MECHANISM_IDEOPHONE,
  MECHANISM_CONVERSION,
  // Phase 55 T1: opt-in templatic coinage. Returns null unless the
  // language carries both `rootInventory` and `rootPatterns`. Non-
  // templatic presets are unaffected.
  MECHANISM_TEMPLATE,
];
