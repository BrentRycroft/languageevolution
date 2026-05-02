import { useEffect } from "react";
import { useSimStore } from "../../state/store";
import { TABS, type TabId } from "../tabs";

interface Options {
  playing: boolean;
  togglePlay: () => void;
  step: () => void;
  stepN: (n: number) => void;
  reset: () => void;
  setActiveTab: (tab: TabId) => void;
  /**
   * Optional global-search opener. When provided, ⌘/Ctrl-K opens it.
   */
  openGlobalSearch?: () => void;
}

export function useKeyboardShortcuts(options: Options): void {
  const { playing, togglePlay, step, stepN, reset, setActiveTab, openGlobalSearch } = options;
  const showConfirm = useSimStore((s) => s.showConfirm);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        // Only allow ⌘/Ctrl-K to slip through input focus.
        if (!((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey))) {
          return;
        }
      }
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        if (openGlobalSearch) {
          e.preventDefault();
          openGlobalSearch();
        }
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
        void (async () => {
          const ok = await showConfirm({
            title: "Reset to generation 0?",
            message: "This discards the current run.",
            confirmLabel: "Reset",
            danger: true,
          });
          if (ok) reset();
        })();
      } else if (e.key >= "1" && e.key <= "9") {
        // Tabs 1..9 map to the first 9 entries of the visible tab bar.
        const idx = parseInt(e.key, 10) - 1;
        const tab = TABS[idx];
        if (tab) setActiveTab(tab.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playing, togglePlay, step, stepN, reset, setActiveTab, showConfirm, openGlobalSearch]);
}
