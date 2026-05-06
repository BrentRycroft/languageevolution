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
  if (!lang.activeModules || lang.activeModules.size === 0) return [];
  const active: AnyModule[] = [];
  for (const id of lang.activeModules) {
    const m = REGISTRY.get(id);
    if (m) active.push(m);
  }
  return toposort(active);
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
