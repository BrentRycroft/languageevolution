/**
 * Phase 50 T7: keyboard-shortcut reference card. Triggered by `?`,
 * dismissed by `Esc` or click-outside. Reads the canonical TABS array
 * to keep the displayed shortcuts in sync with `useKeyboardShortcuts`.
 */
import { useEffect } from "react";
import { TABS } from "./tabs";

interface HelpOverlayProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutRow {
  keys: string;
  label: string;
}

const GLOBAL_SHORTCUTS: ReadonlyArray<ShortcutRow> = [
  { keys: "Space", label: "Play / pause simulation" },
  { keys: "→", label: "Step one generation (when paused)" },
  { keys: "F", label: "Fast-forward 50 generations" },
  { keys: "Shift + ←/→", label: "Cycle through tabs" },
  { keys: "⌘/Ctrl + K", label: "Open global search" },
  { keys: "⌘/Ctrl + R", label: "Reset to generation 0" },
  { keys: "?", label: "Open this help overlay" },
  { keys: "Esc", label: "Close overlay or modal" },
];

export function HelpOverlay({ open, onClose }: HelpOverlayProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 24,
          minWidth: 360,
          maxWidth: 540,
          maxHeight: "80vh",
          overflowY: "auto",
          color: "var(--text)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
          <h2 id="help-title" style={{ margin: 0, fontSize: 16 }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            className="ghost"
            onClick={onClose}
            aria-label="Close help"
            style={{ fontSize: 12 }}
          >
            ✕ Esc
          </button>
        </div>
        <section style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Global
          </div>
          <table style={{ width: "100%", fontSize: 13, borderSpacing: 0 }}>
            <tbody>
              {GLOBAL_SHORTCUTS.map((s) => (
                <tr key={s.keys}>
                  <td style={{ padding: "3px 8px 3px 0", fontFamily: "var(--font-mono)", color: "var(--accent)", whiteSpace: "nowrap" }}>
                    {s.keys}
                  </td>
                  <td style={{ padding: "3px 0", color: "var(--text)" }}>{s.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            Tab navigation (1–9)
          </div>
          <table style={{ width: "100%", fontSize: 13, borderSpacing: 0 }}>
            <tbody>
              {TABS.slice(0, 9).map((t, i) => (
                <tr key={t.id}>
                  <td style={{ padding: "3px 8px 3px 0", fontFamily: "var(--font-mono)", color: "var(--accent)", whiteSpace: "nowrap", width: 30 }}>
                    {i + 1}
                  </td>
                  <td style={{ padding: "3px 0", color: "var(--text)" }}>
                    <strong>{t.label}</strong>
                    {" — "}
                    <span style={{ color: "var(--muted)", fontSize: 11 }}>{t.title}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
            Tabs 10–{TABS.length} reachable via Shift+→.
          </div>
        </section>
      </div>
    </div>
  );
}
