import type { SavedRun, SimulationConfig } from "../engine/types";
import { defaultConfig } from "../engine/config";

export const LATEST_SAVE_VERSION = 5;

export function migrateSavedRun(raw: unknown): SavedRun | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const version = typeof obj.version === "number" ? obj.version : 1;
  if (version > LATEST_SAVE_VERSION) return null;
  if (!obj.config || typeof obj.config !== "object") return null;

  const defaults = defaultConfig();
  const oldConfig = obj.config as Record<string, unknown>;
  const oldModes = (oldConfig.modes as Record<string, unknown>) ?? {};
  const oldTree = (oldConfig.tree as Record<string, unknown>) ?? {};
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
    version: 5,
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
