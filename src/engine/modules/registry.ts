/**
 * Phase 41a: module registry.
 *
 * Modules register at module-load time via `registerModule`. The
 * registry is global-singleton because modules are static
 * declarations of capability, not runtime instances.
 *
 * `activeModulesOf(lang)` returns the modules in `lang.activeModules`
 * in topological order (requires-first), so a module's `initState` /
 * `step` always runs after its dependencies' have completed.
 */

import type { AnyModule, ModuleKind, SimulationModule } from "./types";
import type { Language } from "../types";

const REGISTRY = new Map<string, AnyModule>();

export function registerModule<S>(m: SimulationModule<S>): void {
  if (REGISTRY.has(m.id)) {
    throw new Error(`module ${m.id} already registered`);
  }
  REGISTRY.set(m.id, m as AnyModule);
}

export function getModule(id: string): AnyModule | undefined {
  return REGISTRY.get(id);
}

export function modulesByKind(kind: ModuleKind): AnyModule[] {
  const out: AnyModule[] = [];
  for (const m of REGISTRY.values()) {
    if (m.kind === kind) out.push(m);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

/**
 * Topological sort over `requires`. Throws on cycles.
 * Stable: modules with no incoming edges sort by id for deterministic
 * iteration across runs.
 */
function toposort(modules: AnyModule[]): AnyModule[] {
  const byId = new Map<string, AnyModule>();
  for (const m of modules) byId.set(m.id, m);
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const out: AnyModule[] = [];
  function visit(m: AnyModule): void {
    if (visited.has(m.id)) return;
    if (visiting.has(m.id)) {
      throw new Error(`module dependency cycle through ${m.id}`);
    }
    visiting.add(m.id);
    const deps = (m.requires ?? []).slice().sort();
    for (const dep of deps) {
      const depMod = byId.get(dep);
      if (depMod) visit(depMod);
      // missing dep is permissive: a module can require a kind it
      // expects to exist but isn't currently active. The runtime
      // will simply not call it.
    }
    visiting.delete(m.id);
    visited.add(m.id);
    out.push(m);
  }
  const sortedIds = modules.map((m) => m.id).sort();
  for (const id of sortedIds) {
    const m = byId.get(id);
    if (m) visit(m);
  }
  return out;
}

/**
 * Returns the modules in `lang.activeModules` in topological order.
 * Empty array when `activeModules` is undefined or empty (back-compat
 * for pre-Phase-41 languages).
 */
export function activeModulesOf(lang: Language): AnyModule[] {
  // Tolerate non-Set activeModules (e.g., after JSON-clone roundtrip
  // in legacy test helpers). Treat as empty — back-compat path.
  if (!lang.activeModules || !(lang.activeModules instanceof Set)) return [];
  if (lang.activeModules.size === 0) return [];
  const active: AnyModule[] = [];
  for (const id of lang.activeModules) {
    const m = REGISTRY.get(id);
    if (m) active.push(m);
  }
  return toposort(active);
}

/**
 * Phase 46c: lazy state allocation.
 *
 * Modules that omit `initState` are stateless — calling them requires
 * no per-language state slot. The registry skips allocating an empty
 * `moduleState[m.id]` object for these modules; the runtime passes
 * `undefined` to the hooks (which have to tolerate it via the
 * generic-S parameter).
 *
 * Saves ~5-10% memory on a 100-leaf tree at full module activation
 * (most modules in Phases 41-45 are stateful, but the gain compounds
 * once Phase 46a-driven cleanup leaves more stateless leaves).
 *
 * Returns true when the module declares an `initState` hook (and
 * therefore needs a slot allocated); false for stateless modules.
 */
export function moduleNeedsState(id: string): boolean {
  const m = REGISTRY.get(id);
  return !!m && typeof m.initState === "function";
}

/**
 * Phase 46d: deferred (mid-run) module activation.
 *
 * A language can acquire a feature mid-simulation via
 * grammaticalisation — e.g., `maybeArticleEmergence` (Phase 33i)
 * promotes a demonstrative into the definite article. When that
 * fires, the language should also activate the corresponding
 * module so its step + realise hooks start running on the next
 * generation.
 *
 * `activateModule(lang, id, ctx)` is idempotent — re-activating an
 * already-active module is a no-op. Returns true when the module
 * was newly activated, false when it was already in the active set
 * or not registered.
 *
 * The caller (typically a step function in
 * morphology/evolve.ts) is responsible for setting the underlying
 * legacy flag in `lang.grammar.X` first; this function only handles
 * the module side.
 */
export function activateModule(
  lang: Language,
  id: string,
  ctx: { generation: number; rng: import("../rng").Rng; config: import("../types").SimulationConfig },
): boolean {
  const m = REGISTRY.get(id);
  if (!m) return false;
  if (!(lang.activeModules instanceof Set)) lang.activeModules = new Set<string>();
  if (lang.activeModules.has(id)) return false;
  lang.activeModules.add(id);
  if (!lang.moduleState) lang.moduleState = {};
  if (m.initState) {
    lang.moduleState[id] = m.initState(lang, ctx);
  }
  return true;
}

/**
 * Phase 46d: deferred module deactivation.
 *
 * Mirror of `activateModule`. When a feature is lost via decay
 * (e.g., case decay flattening `grammar.hasCase` from true to false),
 * the corresponding module should be removed from the active set so
 * its hooks stop firing. The state slot is dropped to free memory.
 */
export function deactivateModule(lang: Language, id: string): boolean {
  if (!(lang.activeModules instanceof Set) || !lang.activeModules.has(id)) return false;
  lang.activeModules.delete(id);
  if (lang.moduleState && id in lang.moduleState) {
    delete lang.moduleState[id];
  }
  return true;
}

/**
 * Test-only: clears the registry. Useful for module-specific tests
 * that register fixtures.
 */
export function _resetRegistry(): void {
  REGISTRY.clear();
}

/**
 * Test-only: returns all registered module ids.
 */
export function _allRegisteredIds(): string[] {
  return Array.from(REGISTRY.keys()).sort();
}
