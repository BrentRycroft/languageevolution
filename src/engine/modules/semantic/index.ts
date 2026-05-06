/**
 * Phase 45 — semantic modules barrel.
 *
 * 10 modules total:
 *   - lexicon         — owns Language.lexicon / words / wordsByFormKey /
 *                       wordOrigin / lastChangeGeneration / localNeighbors /
 *                       wordOriginChain (the central data module)
 *   - clusters        — semantic-cluster mappings (kinship / body /
 *                       motion / colour / etc.)
 *   - frequency       — wordFrequencyHints / registerOf / registerStrata;
 *                       feeds Swadesh brake + variant gating
 *   - synonymy        — Phase 37 synonym-stack + Phase 40b variants
 *   - colexification  — cross-meaning form-sharing
 *   - borrowing       — surface lexical borrowing under contact
 *   - calque          — structural calquing under contact
 *   - reborrow        — structural / re-acquisitive borrowing
 *   - taboo           — Phase 23 word-replacement under cultural pressure
 *   - coinage         — genesis pipeline (compound / derivation /
 *                       sound-symbolic / blend / clipping / ideophone)
 *
 * Topological dependencies (registry honours `requires`):
 *   lexicon (root)
 *   clusters (root — independent of lexicon at boot, but step-time
 *             mechanisms cross-read)
 *   frequency (← lexicon)
 *     ├─ synonymy (← lexicon, frequency)
 *     ├─ coinage (← lexicon, clusters, frequency)
 *   colexification (← lexicon, clusters)
 *   borrowing / calque / reborrow (← lexicon)
 *   taboo (← lexicon, clusters)
 *
 * The performance win at Phase 46a: a "minimal-vocabulary" preset
 * (only `semantic:lexicon` active) skips the other 9 modules
 * entirely. Plan target: ≥ 2× per-gen speedup over full preset.
 */

import { registerLexiconModule } from "./lexicon";
import { registerClustersModule } from "./clusters";
import { registerFrequencyModule } from "./frequency";
import { registerSynonymyModule } from "./synonymy";
import { registerColexificationModule } from "./colexification";
import { registerBorrowingModule } from "./borrowing";
import { registerCalqueModule } from "./calque";
import { registerReborrowModule } from "./reborrow";
import { registerTabooModule } from "./taboo";
import { registerCoinageModule } from "./coinage";

let registered = false;

export function registerSemanticModules(): void {
  if (registered) return;
  registered = true;
  registerLexiconModule();
  registerClustersModule();
  registerFrequencyModule();
  registerSynonymyModule();
  registerColexificationModule();
  registerBorrowingModule();
  registerCalqueModule();
  registerReborrowModule();
  registerTabooModule();
  registerCoinageModule();
}

export const SEMANTIC_MODULE_IDS = [
  "semantic:lexicon",
  "semantic:clusters",
  "semantic:frequency",
  "semantic:synonymy",
  "semantic:colexification",
  "semantic:borrowing",
  "semantic:calque",
  "semantic:reborrow",
  "semantic:taboo",
  "semantic:coinage",
] as const;

export type SemanticModuleId = (typeof SEMANTIC_MODULE_IDS)[number];
