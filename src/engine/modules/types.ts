/**
 * Phase 41a: simulation module interface.
 *
 * The simulator's typological surface is rich (~30 grammar features,
 * ~20 morphology axes, ~10 semantic mechanisms) but pre-Phase-41
 * dispatch is monolithic — `realiseSentence` checks every flag for
 * every language; the step loop runs 14 step functions per leaf per
 * gen unconditionally.
 *
 * The module interface lets each typological feature live in its own
 * file with explicit ownership of state + lifecycle hooks. Languages
 * declare `activeModules` and the engine only runs the active set.
 *
 * Phases 41-45 develop modules in parallel with legacy paths
 * (back-compat via `if (!lang.activeModules) { /* legacy *\/ }`).
 * Phase 46a inverts the default and drops the fallback.
 */

import type { Language, SimulationConfig, SimulationState } from "../types";
import type { Rng } from "../rng";

export type ModuleKind = "grammatical" | "syntactical" | "morphological" | "semantic";

export interface InitCtx {
  generation: number;
  rng: Rng;
  config: SimulationConfig;
}

export interface StepCtx {
  generation: number;
  rng: Rng;
  config: SimulationConfig;
  state: SimulationState;
}

/**
 * Stage at which a module's `realise` hook fires within the
 * translator pipeline. The stages mirror the existing structural
 * milestones in `realiseSentence` (translator/realise.ts).
 */
export type RealiseStage =
  | "populate-forms"
  | "resolve-alignment"
  | "realise-subject"
  | "realise-verb"
  | "realise-object"
  | "realise-pps"
  | "order-tokens"
  | "post-process";

/**
 * Generic shape of a simulation module. Type parameter S is the
 * module's per-language state (anything from a count to a deeply-
 * nested object).
 */
export interface SimulationModule<S = unknown> {
  /** Stable identifier; used as Set<ModuleId> key. */
  id: string;
  /** Categorical bucket. Used for diagnostics + Phase 46 perf panel. */
  kind: ModuleKind;
  /**
   * Soft dependencies — modules whose `initState` must run before
   * this one's. Used by the registry's topological sort. A cycle
   * throws at registration time.
   */
  requires?: ReadonlyArray<string>;
  /**
   * Per-language state initialiser. Stateless modules omit this.
   * Called at language birth (`buildInitialState`) and at split
   * (when daughters inherit the parent's active set).
   */
  initState?(lang: Language, ctx: InitCtx): S;
  /**
   * Per-gen tick. Called only when this module is in
   * `lang.activeModules`. Skipped entirely for languages that
   * don't activate the module — the performance win.
   */
  step?(lang: Language, state: S, ctx: StepCtx): void;
  /**
   * Stage at which the realise hook is called. Mandatory if `realise`
   * is set; ignored otherwise.
   */
  realiseStage?: RealiseStage;
  /**
   * Realiser hook. The pipeline calls every active module's `realise`
   * at the matching stage in registration order. The module receives
   * the in-flight pipeline context, mutates it, and returns it.
   *
   * RealiseInput / RealiseOutput are intentionally untyped here so
   * the spine can be defined before the pipeline shape is finalised
   * (Tranche 41c). Modules cast as needed.
   */
  realise?(input: unknown, lang: Language, state: S, ctx: unknown): unknown;
  /**
   * Persistence — module-owned state (de)serialiser. Without a
   * `serialise` hook, the registry deep-clones `state` via
   * `JSON.parse(JSON.stringify(...))`. Modules with reference-typed
   * state (Maps, Sets, etc.) must provide both hooks.
   */
  serialise?(state: S): unknown;
  deserialise?(raw: unknown): S;
}

/**
 * Convenience erased-type alias for collections that hold modules
 * of mixed S parameters (e.g., the registry).
 */
export type AnyModule = SimulationModule<unknown>;
