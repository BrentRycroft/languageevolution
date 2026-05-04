import { useMemo, useRef, useState, useEffect } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { Z } from "./zIndex";
import { TIER_LABELS } from "../engine/lexicon/concepts";

export function SelectedLanguageBar() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectLanguage = useSimStore((s) => s.selectLanguage);

  const alive = useMemo(() => {
    return leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct);
  }, [state.tree]);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  const selected = selectedLangId ? state.tree[selectedLangId]?.language : undefined;
  if (!selected) {
    return null;
  }
  const tier = (selected.culturalTier ?? 0) as 0 | 1 | 2 | 3;
  const tierIcon = ["🌿", "🌾", "🛕", "🏭"][tier];
  const speakers = selected.speakers ?? 0;
  const tempo = selected.conservatism >= 1.3 ? "🐢" : selected.conservatism <= 0.7 ? "🐇" : "⏱";

  return (
    <div
      ref={ref}
      className="selected-language-bar"
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "4px 10px",
        background: "var(--panel-2)",
        borderBottom: "1px solid var(--border)",
        fontSize: "var(--fs-1)",
        color: "var(--muted)",
      }}
    >
      <button
        type="button"
        className="ghost"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "2px 10px",
          minHeight: 28,
          fontSize: "var(--fs-1)",
          fontWeight: "var(--fw-semi)",
        }}
        title="Switch the selected language"
      >
        <span className="t-text">★ {selected.name}</span>
        <span className="t-muted">▾</span>
      </button>
      <span title={`Cultural tier: ${TIER_LABELS[tier]}`}>{tierIcon} {TIER_LABELS[tier]}</span>
      <span title={`Conservatism ${selected.conservatism.toFixed(2)}`}>
        {tempo} {selected.conservatism.toFixed(2)}
      </span>
      <span>{speakers.toLocaleString()} speakers</span>
      <span>{Object.keys(selected.lexicon).length} words</span>
      {selected.volatilityPhase?.kind === "upheaval" && (
        <span
          className="t-danger"
          title={`Rapid-change era — multiplier ×${selected.volatilityPhase.multiplier.toFixed(1)}, until gen ${selected.volatilityPhase.until}${
            selected.volatilityPhase.trigger
              ? ` (trigger: ${selected.volatilityPhase.trigger})`
              : ""
          }`}
        >
          ⚡ upheaval ×{selected.volatilityPhase.multiplier.toFixed(1)}
        </span>
      )}
      {selected.extinct && (
        <span className="t-danger">† extinct</span>
      )}
      {open && (
        <div
          role="listbox"
          aria-label="Switch language"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 6,
            zIndex: Z.dropdown,
            minWidth: 200,
            maxHeight: 320,
            overflow: "auto",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
            boxShadow: "var(--shadow-3)",
            padding: 4,
          }}
        >
          {alive.length === 0 ? (
            <div style={{ padding: 8, color: "var(--muted)" }}>
              No alive languages
            </div>
          ) : (
            alive.map((id) => {
              const lang = state.tree[id]!.language;
              const isCurrent = id === selectedLangId;
              return (
                <button
                  key={id}
                  role="option"
                  aria-selected={isCurrent}
                  onClick={() => {
                    selectLanguage(id);
                    setOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "6px 10px",
                    background: isCurrent ? "var(--panel-2)" : "transparent",
                    color: "var(--text)",
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-1)",
                    border: "none",
                    borderRadius: "var(--r-1)",
                    cursor: "pointer",
                  }}
                >
                  {lang.name}
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                    {(lang.speakers ?? 0).toLocaleString()} speakers
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
