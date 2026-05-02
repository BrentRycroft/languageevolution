import { describe, it, expect, beforeEach } from "vitest";
import {
  loadUserPresets,
  saveUserPreset,
  deleteUserPreset,
  makeUserPresetId,
  type UserPreset,
} from "../userPresets";
import { defaultConfig } from "../../engine/config";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.clear();
});

function fixture(overrides: Partial<UserPreset> = {}): UserPreset {
  return {
    id: "test-preset",
    label: "Test",
    description: "fixture preset",
    createdAt: 1000,
    config: defaultConfig(),
    ...overrides,
  };
}

describe("userPresets", () => {
  it("loadUserPresets returns [] when nothing saved", () => {
    expect(loadUserPresets()).toEqual([]);
  });

  it("save then load round-trips", () => {
    const p = fixture();
    expect(saveUserPreset(p)).toBe(true);
    const loaded = loadUserPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe("test-preset");
    expect(loaded[0]?.label).toBe("Test");
  });

  it("save with same id replaces the existing entry", () => {
    saveUserPreset(fixture({ label: "First" }));
    saveUserPreset(fixture({ label: "Second" }));
    const all = loadUserPresets();
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe("Second");
  });

  it("save with different ids appends", () => {
    saveUserPreset(fixture({ id: "a", label: "A" }));
    saveUserPreset(fixture({ id: "b", label: "B" }));
    const all = loadUserPresets();
    expect(all.map((p) => p.id).sort()).toEqual(["a", "b"]);
  });

  it("deleteUserPreset removes the entry", () => {
    saveUserPreset(fixture({ id: "to-delete" }));
    expect(deleteUserPreset("to-delete")).toBe(true);
    expect(loadUserPresets()).toEqual([]);
  });

  it("deleteUserPreset returns false when id not found", () => {
    expect(deleteUserPreset("nonexistent")).toBe(false);
  });

  it("makeUserPresetId generates a slug + timestamp", () => {
    const a = makeUserPresetId("My Cool Preset!");
    expect(a).toMatch(/^my-cool-preset-/);
  });

  it("makeUserPresetId falls back to 'preset' for empty input", () => {
    expect(makeUserPresetId("")).toMatch(/^preset-/);
    expect(makeUserPresetId("!!!")).toMatch(/^preset-/);
  });

  it("ignores corrupt JSON in storage", () => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("lev-user-presets-v1", "{not json");
    expect(loadUserPresets()).toEqual([]);
  });

  it("ignores wrong-version payload", () => {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem("lev-user-presets-v1", JSON.stringify({ version: 99, presets: [] }));
    expect(loadUserPresets()).toEqual([]);
  });
});
