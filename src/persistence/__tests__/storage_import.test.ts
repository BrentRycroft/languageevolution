import { describe, it, expect, beforeEach } from "vitest";
import { exportRun, importRunJson, importAndSaveRun, listRuns, deleteRun } from "../storage";
import { defaultConfig } from "../../engine/config";
import type { SavedRun } from "../../engine/types";

beforeEach(async () => {
  if (typeof localStorage !== "undefined") localStorage.clear();
  // Phase 38+: clear the IDB-backed runs index too.
  for (const r of await listRuns()) await deleteRun(r.id);
});

function fixture(): SavedRun {
  return {
    version: 8,
    id: "run-test",
    label: "Original run",
    createdAt: 1000,
    config: defaultConfig(),
    generationsRun: 42,
  };
}

describe("storage import/export", () => {
  it("exportRun produces parseable JSON containing the label + generationsRun", () => {
    const json = exportRun(fixture());
    const parsed = JSON.parse(json);
    expect(parsed.label).toBe("Original run");
    expect(parsed.generationsRun).toBe(42);
  });

  it("importRunJson round-trips an exported run", () => {
    const json = exportRun(fixture());
    const imported = importRunJson(json);
    expect(imported).not.toBeNull();
    expect(imported!.label).toBe("Original run");
    expect(imported!.generationsRun).toBe(42);
  });

  it("importRunJson returns null for malformed JSON", () => {
    expect(importRunJson("{not json")).toBeNull();
  });

  it("importRunJson returns null when payload fails migration (no config)", () => {
    expect(importRunJson(JSON.stringify({ version: 5, id: "x", label: "y" }))).toBeNull();
  });

  it("importAndSaveRun persists the run with a fresh id", async () => {
    const json = exportRun(fixture());
    const saved = await importAndSaveRun(json);
    expect(saved).not.toBeNull();
    expect(saved!.id).not.toBe("run-test");
    const runs = await listRuns();
    expect(runs.some((r) => r.id === saved!.id)).toBe(true);
  });

  it("importAndSaveRun multiple times produces distinct ids", async () => {
    const json = exportRun(fixture());
    const a = await importAndSaveRun(json);
    const b = await importAndSaveRun(json);
    expect(a?.id).not.toBe(b?.id);
    expect((await listRuns()).length).toBe(2);
  });
});
