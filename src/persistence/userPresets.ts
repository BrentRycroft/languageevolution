import type { SimulationConfig } from "../engine/types";

const KEY = "lev-user-presets-v1";

function safeGet(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function safeSet(value: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    localStorage.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}

export interface UserPreset {
  id: string;
  label: string;
  description: string;
  createdAt: number;
  config: SimulationConfig;
}

interface UserPresetsFile {
  version: 1;
  presets: UserPreset[];
}

export function loadUserPresets(): UserPreset[] {
  const raw = safeGet();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as UserPresetsFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.presets)) return [];
    return parsed.presets;
  } catch {
    return [];
  }
}

function persist(presets: UserPreset[]): boolean {
  const file: UserPresetsFile = { version: 1, presets };
  return safeSet(JSON.stringify(file));
}

export function saveUserPreset(preset: UserPreset): boolean {
  const all = loadUserPresets();
  const existing = all.findIndex((p) => p.id === preset.id);
  if (existing >= 0) all[existing] = preset;
  else all.push(preset);
  return persist(all);
}

export function deleteUserPreset(id: string): boolean {
  const all = loadUserPresets();
  const next = all.filter((p) => p.id !== id);
  if (next.length === all.length) return false;
  return persist(next);
}

/** Generate a stable, slug-like id from a label, with timestamp suffix for uniqueness. */
export function makeUserPresetId(label: string): string {
  const slug =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "preset";
  return `${slug}-${Date.now().toString(36)}`;
}
