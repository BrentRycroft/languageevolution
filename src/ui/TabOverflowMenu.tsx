import { useEffect, useRef, useState } from "react";
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
 */
export function TabOverflowMenu({ tabs, activeTab, setActiveTab }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const activeInOverflow = tabs.some((t) => t.id === activeTab);

  return (
    <div ref={containerRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        className={activeInOverflow ? "active" : ""}
        onClick={() => setOpen((o) => !o)}
        title="More tabs"
      >
        More ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
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
        </div>
      )}
    </div>
  );
}
