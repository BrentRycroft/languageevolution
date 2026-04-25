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

export const MECHANISMS: readonly CoinageMechanism[] = [
  MECHANISM_COMPOUND,
  MECHANISM_DERIVATION,
  MECHANISM_REDUPLICATION,
  MECHANISM_CALQUE,
  MECHANISM_CLIPPING,
  MECHANISM_BLENDING,
  MECHANISM_IDEOPHONE,
  MECHANISM_CONVERSION,
];
