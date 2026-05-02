import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Z } from "./zIndex";
import type { TabSpec, TabId } from "./tabs";

interface Props {
  tabs: TabSpec[];
  activeTab: TabId;
  setActiveTab: (id: TabId) => void;
}

/**
 * "More ▾" overflow dropdown for tabs beyond the first 9. The first 9 stay
 * inline (matching the 1-9 keyboard shortcuts); 10+ go in here so the tab
 * bar doesn't overflow on narrow viewports.
 *
 * The dropdown renders into a React portal anchored at document.body so
 * it escapes the .tab-bar's `overflow-x: auto` clipping (browsers
 * implicitly clip the other axis when one overflow value is non-visible,
 * which would hide a normally-positioned absolute child below the bar).
 * Position is computed from the trigger button's getBoundingClientRect.
 */
export function TabOverflowMenu({ tabs, activeTab, setActiveTab }: Props) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  // Recompute popup position whenever it opens (or window resizes / scrolls).
  useLayoutEffect(() => {
    if (!open) return;
    const compute = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPosition({
        top: rect.bottom + 4,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("scroll", compute, true);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("scroll", compute, true);
    };
  }, [open]);

  // Close on outside click — popup is portalled, so the contains() check
  // has to consult both the trigger and the popup.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const activeInOverflow = tabs.some((t) => t.id === activeTab);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={activeInOverflow ? "active" : ""}
        onClick={() => setOpen((o) => !o)}
        title="More tabs"
      >
        More ▾
      </button>
      {open && position && createPortal(
        <div
          ref={popupRef}
          role="menu"
          style={{
            position: "fixed",
            top: position.top,
            right: position.right,
            zIndex: Z.dropdown,
            minWidth: 160,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
            boxShadow: "var(--shadow-2)",
            padding: 4,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              type="button"
              className={t.id === activeTab ? "active" : ""}
              onClick={() => {
                setActiveTab(t.id);
                setOpen(false);
              }}
              title={t.title}
              style={{
                textAlign: "left",
                fontSize: 12,
                padding: "4px 8px",
                background: "transparent",
                border: "none",
                color: t.id === activeTab ? "var(--accent)" : "var(--text)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
