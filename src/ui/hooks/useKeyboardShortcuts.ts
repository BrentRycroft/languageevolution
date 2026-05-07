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
   * Phase 29 Tranche 8c: current active tab. Used by Shift+Arrow
   * keys to cycle through the tab bar without taking focus.
   * Optional for back-compat with callers that don't track it.
   */
  activeTab?: TabId;
  /**
   * Optional global-search opener. When provided, ⌘/Ctrl-K opens it.
   */
  openGlobalSearch?: () => void;
  /**
   * Phase 50 T7: optional help-overlay toggle. When provided, `?`
   * opens the keyboard-shortcut reference card.
   */
  toggleHelp?: () => void;
}

export function useKeyboardShortcuts(options: Options): void {
  const { playing, togglePlay, step, stepN, reset, setActiveTab, activeTab, openGlobalSearch, toggleHelp } = options;
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
      // Phase 50 T7: ? opens the keyboard help overlay.
      if (e.key === "?" && toggleHelp) {
        e.preventDefault();
        toggleHelp();
        return;
      }
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft") && activeTab) {
        // Phase 29 Tranche 8c: Shift+Arrow cycles through tabs.
        // Shift-modified so plain ArrowRight still steps a generation.
        e.preventDefault();
        const idx = TABS.findIndex((t) => t.id === activeTab);
        if (idx >= 0) {
          const delta = e.key === "ArrowRight" ? 1 : -1;
          const next = TABS[(idx + delta + TABS.length) % TABS.length];
          if (next) setActiveTab(next.id);
        }
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
  }, [playing, togglePlay, step, stepN, reset, setActiveTab, activeTab, showConfirm, openGlobalSearch, toggleHelp]);
}
