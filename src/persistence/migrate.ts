import type {
  Language,
  SavedRun,
  SimulationConfig,
} from "../engine/types";
import { defaultConfig } from "../engine/config";
import { syncWordsFromLexicon } from "../engine/lexicon/word";
import { addSynonym } from "../engine/lexicon/mutate";

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
export const LATEST_SAVE_VERSION = 8;

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
  // Phase 29 Tranche 1b: drop the duplicate `Language.speakerCount` field.
  // Pre-v7 saves carrying speakerCount get its value copied into
  // `speakers` if speakers is undefined, then speakerCount is removed.
  6: (raw) => {
    const snapshot = raw.stateSnapshot as RawObj | undefined;
    if (snapshot && snapshot.tree && typeof snapshot.tree === "object") {
      const tree = snapshot.tree as Record<string, RawObj>;
      for (const node of Object.values(tree)) {
        const langRaw = node.language as RawObj | undefined;
        if (!langRaw) continue;
        if (
          typeof langRaw.speakerCount === "number" &&
          typeof langRaw.speakers !== "number"
        ) {
          langRaw.speakers = langRaw.speakerCount;
        }
        delete langRaw.speakerCount;
      }
    }
    return { ...raw, version: 7 };
  },
  // Phase 37: fold existing `altForms` entries into the `words` table
  // as synonym senses. After migration the `words` table is the single
  // source of truth for both directions (synonymy + homonymy).
  // `altForms` is preserved on the in-memory object for back-compat
  // but writers should prefer `addSynonym` going forward.
  7: (raw) => {
    const snapshot = raw.stateSnapshot as RawObj | undefined;
    if (snapshot && snapshot.tree && typeof snapshot.tree === "object") {
      const tree = snapshot.tree as Record<string, RawObj>;
      const generation =
        typeof snapshot.generation === "number" ? snapshot.generation : 0;
      for (const node of Object.values(tree)) {
        const lang = node.language as Language | undefined;
        if (!lang) continue;
        const altForms = (lang as unknown as { altForms?: Record<string, unknown[]> }).altForms;
        if (!altForms || !lang.words) continue;
        for (const [meaning, alts] of Object.entries(altForms)) {
          if (!Array.isArray(alts)) continue;
          for (const alt of alts) {
            if (!Array.isArray(alt)) continue;
            const form = alt as string[];
            if (form.length === 0) continue;
            addSynonym(lang, meaning, form, {
              bornGeneration: generation,
              origin: "altForms-migration",
            });
          }
        }
      }
    }
    return { ...raw, version: 8 };
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
      // Phase 29 Tranche 3b: defaulted true so old saves behave as before.
      contact: pickBool(oldModes.contact, defaults.modes.contact),
      volatility: pickBool(oldModes.volatility, defaults.modes.volatility),
      areal: pickBool(oldModes.areal, defaults.modes.areal),
      creolization: pickBool(oldModes.creolization, defaults.modes.creolization),
      learner: pickBool(oldModes.learner, defaults.modes.learner),
      obsolescence: pickBool(oldModes.obsolescence, defaults.modes.obsolescence),
      taboo: pickBool(oldModes.taboo, defaults.modes.taboo),
      copula: pickBool(oldModes.copula, defaults.modes.copula),
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
