import { useEffect } from "react";

type Tab =
  | "tree"
  | "map"
  | "dictionary"
  | "timeline"
  | "grammar"
  | "events"
  | "translate"
  | "compare"
  | "stats";

const TAB_ORDER: Tab[] = [
  "tree",
  "map",
  "dictionary",
  "timeline",
  "grammar",
  "events",
  "translate",
  "compare",
  "stats",
];

interface Options {
  playing: boolean;
  togglePlay: () => void;
  step: () => void;
  stepN: (n: number) => void;
  reset: () => void;
  setActiveTab: (tab: Tab) => void;
}

/**
 * Global keyboard shortcuts for the simulator. Ignores key events when the
 * active element is a text input, textarea, or contenteditable — so typing
 * in the seed editor or translator won't trigger playback keys.
 */
export function useKeyboardShortcuts(options: Options): void {
  const { playing, togglePlay, step, stepN, reset, setActiveTab } = options;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight" && !playing) {
        e.preventDefault();
        step();
      } else if (e.key === "f") {
        e.preventDefault();
        stepN(50);
      } else if (e.key === "r" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (confirm("Reset to generation 0?")) reset();
      } else if (e.key >= "1" && e.key <= "9") {
        const idx = parseInt(e.key, 10) - 1;
        if (TAB_ORDER[idx]) setActiveTab(TAB_ORDER[idx]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, togglePlay, step, stepN, reset, setActiveTab]);
}
