import { useEffect } from "react";
import { useSimStore } from "../state/store";
import { SunIcon, MoonIcon, AutoThemeIcon } from "./icons";

type Theme = "dark" | "light" | "system";

function systemPrefersLight(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false;
}

function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const effective: "dark" | "light" =
    theme === "system" ? (systemPrefersLight() ? "light" : "dark") : theme;
  root.classList.toggle("theme-light", effective === "light");
  root.classList.toggle("theme-dark", effective === "dark");
}

export function ThemeEffect() {
  const theme = useSimStore((s) => s.theme);
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => applyTheme("system");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);
  return null;
}

export function ThemeToggle() {
  const theme = useSimStore((s) => s.theme);
  const setTheme = useSimStore((s) => s.setTheme);
  const next: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
  const Icon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : AutoThemeIcon;
  const label =
    theme === "dark"
      ? "Theme: dark (click for light)"
      : theme === "light"
        ? "Theme: light (click for system)"
        : "Theme: system (click for dark)";
  return (
    <button
      className="ghost icon-only"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      <Icon size={16} />
    </button>
  );
}
