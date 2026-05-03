import type {
  Language,
  SavedRun,
  SimulationConfig,
} from "../engine/types";
import { defaultConfig } from "../engine/config";
import { syncWordsFromLexicon } from "../engine/lexicon/word";

/**
 * Bump LATEST_SAVE_VERSION when adding a breaking change. Each bump must:
 *  1. add an entry in MIGRATIONS keyed by the OLD version that transforms
 *     a vN payload into a vN+1 payload.
 *  2. add a regression test in migrate.test.ts that loads a vN fixture and
 *     confirms it migrates correctly.
 *
 * The flatten-with-defaults coda at the end ensures any newly-added fields
 * get default values without needing an explicit migration. Migrations
 * therefore only need to handle field renames, type changes, or removals.
 */
export const LATEST_SAVE_VERSION = 6;

type RawObj = Record<string, unknown>;

/**
 * Per-version upgrade functions. Each takes a payload at version N and returns
 * a payload at version N+1. Run in sequence from the saved version to
 * LATEST_SAVE_VERSION before final coercion.
 *
 * Currently no breaking changes between v1..v6, so all migrations are
 * identity. The infrastructure exists so the next breaking change has a
 * clear place to land.
 */
const MIGRATIONS: Record<number, (raw: RawObj) => RawObj> = {
  1: (raw) => ({ ...raw, version: 2 }),
  2: (raw) => ({ ...raw, version: 3 }),
  3: (raw) => ({ ...raw, version: 4 }),
  4: (raw) => ({ ...raw, version: 5 }),
  // Phase 21a: v6 introduces the form-centric `words` field on Language.
  // For old saves that lack it, build one from the meaning-keyed lexicon
  // (and any colexification metadata) so post-migration languages have
  // both views populated. Same logic the runtime uses on a fresh seed.
  5: (raw) => {
    const snapshot = raw.stateSnapshot as RawObj | undefined;
    if (snapshot && snapshot.tree && typeof snapshot.tree === "object") {
      const tree = snapshot.tree as Record<string, RawObj>;
      const generation =
        typeof snapshot.generation === "number" ? snapshot.generation : 0;
      for (const node of Object.values(tree)) {
        const lang = node.language as Language | undefined;
        if (!lang) continue;
        if (!lang.words) {
          syncWordsFromLexicon(lang, generation);
        }
      }
    }
    return { ...raw, version: 6 };
  },
};

export function migrateSavedRun(raw: unknown): SavedRun | null {
  if (!raw || typeof raw !== "object") return null;
  let obj = raw as RawObj;
  let version = typeof obj.version === "number" ? obj.version : 1;
  if (version > LATEST_SAVE_VERSION) return null;
  if (!obj.config || typeof obj.config !== "object") return null;

  // Apply per-version migrations in sequence.
  while (version < LATEST_SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      // Missing migration step — refuse rather than silently corrupt.
      return null;
    }
    obj = step(obj);
    version = typeof obj.version === "number" ? obj.version : version + 1;
  }

  return coerceLatest(obj);
}

/**
 * Final coercion: merge against current defaults so newly-added optional
 * fields get sensible values without needing a per-version migration.
 */
function coerceLatest(obj: RawObj): SavedRun | null {
  const defaults = defaultConfig();
  const oldConfig = obj.config as RawObj;
  const oldModes = (oldConfig.modes as RawObj) ?? {};
  const oldTree = (oldConfig.tree as RawObj) ?? {};
  const mergedConfig: SimulationConfig = {
    ...defaults,
    ...oldConfig,
    modes: {
      phonology: pickBool(oldModes.phonology, defaults.modes.phonology),
      tree: pickBool(oldModes.tree, defaults.modes.tree),
      genesis: pickBool(oldModes.genesis, defaults.modes.genesis),
      death: pickBool(oldModes.death, defaults.modes.death),
      grammar: pickBool(oldModes.grammar, defaults.modes.grammar),
      semantics: pickBool(oldModes.semantics, defaults.modes.semantics),
    },
    tree: {
      ...defaults.tree,
      ...(oldTree as SimulationConfig["tree"]),
    },
    phonology: {
      ...defaults.phonology,
      ...((oldConfig.phonology as SimulationConfig["phonology"]) ?? {}),
    },
    genesis:
      (oldConfig.genesis as SimulationConfig["genesis"] | undefined) ??
      defaults.genesis,
    grammar:
      (oldConfig.grammar as SimulationConfig["grammar"] | undefined) ??
      defaults.grammar,
    semantics:
      (oldConfig.semantics as SimulationConfig["semantics"] | undefined) ??
      defaults.semantics,
    obsolescence:
      (oldConfig.obsolescence as SimulationConfig["obsolescence"] | undefined) ??
      defaults.obsolescence,
    seedLexicon:
      (oldConfig.seedLexicon as SimulationConfig["seedLexicon"] | undefined) ??
      defaults.seedLexicon,
    seedFrequencyHints:
      (oldConfig.seedFrequencyHints as SimulationConfig["seedFrequencyHints"] | undefined) ??
      defaults.seedFrequencyHints,
    preset:
      typeof oldConfig.preset === "string" ? (oldConfig.preset as string) : undefined,
    evolutionSpeed:
      typeof oldConfig.evolutionSpeed === "string"
        ? (oldConfig.evolutionSpeed as string)
        : "standard",
    morphology:
      (oldConfig.morphology as SimulationConfig["morphology"] | undefined) ??
      defaults.morphology,
    contact:
      (oldConfig.contact as SimulationConfig["contact"] | undefined) ??
      defaults.contact,
    phonology_lawful:
      (oldConfig.phonology_lawful as SimulationConfig["phonology_lawful"] | undefined) ??
      defaults.phonology_lawful,
    taboo:
      (oldConfig.taboo as SimulationConfig["taboo"] | undefined) ??
      defaults.taboo,
    useWorker:
      typeof oldConfig.useWorker === "boolean" ? (oldConfig.useWorker as boolean) : false,
  };
  return {
    version: LATEST_SAVE_VERSION,
    id: String(obj.id ?? ""),
    label: String(obj.label ?? "unlabeled"),
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
    config: mergedConfig,
    generationsRun:
      typeof obj.generationsRun === "number" ? obj.generationsRun : 0,
    stateSnapshot:
      obj.stateSnapshot && typeof obj.stateSnapshot === "object"
        ? (obj.stateSnapshot as import("../engine/types").SimulationState)
        : undefined,
  };
}

function pickBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}
