import { describe, it, expect, beforeEach } from "vitest";
import { t, setLocale, listKeys } from "../i18n";

beforeEach(() => {
  setLocale("en");
});

describe("i18n", () => {
  it("returns the english string for a known key", () => {
    expect(t("onboarding.welcome")).toBe(
      "Welcome to the language evolution simulator",
    );
  });

  it("returns the key itself when not found", () => {
    expect(t("definitely.does.not.exist")).toBe("definitely.does.not.exist");
  });

  it("interpolates {name} placeholders", () => {
    // No catalog entry uses placeholders yet; verify via raw key fallback.
    expect(t("hello {who}", { who: "world" })).toBe("hello world");
  });

  it("listKeys returns the en catalog keys", () => {
    const keys = listKeys();
    expect(keys.length).toBeGreaterThan(0);
    expect(keys).toContain("onboarding.welcome");
    expect(keys).toContain("tab.cognates");
  });

  it("setLocale to en is a no-op (only locale registered)", () => {
    setLocale("en");
    expect(t("common.save")).toBe("Save");
  });
});
