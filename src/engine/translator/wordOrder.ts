import type { Language } from "../types";

/**
 * Map a wordOrder enum value to the constituent permutation used by
 * the realiser. Single source of truth — was duplicated verbatim in
 * `sentence.ts` and `realise.ts`.
 */
export function sliceOrder(
  wo: Language["grammar"]["wordOrder"],
): Array<"S" | "V" | "O"> {
  switch (wo) {
    case "SOV": return ["S", "O", "V"];
    case "SVO": return ["S", "V", "O"];
    case "VSO": return ["V", "S", "O"];
    case "VOS": return ["V", "O", "S"];
    case "OVS": return ["O", "V", "S"];
    case "OSV": return ["O", "S", "V"];
  }
}
