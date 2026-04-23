import { useSimStore } from "../state/store";
import type { LanguageEvent } from "../engine/types";

const KIND_COLOR: Record<LanguageEvent["kind"], string> = {
  sound_change: "var(--accent)",
  coinage: "var(--accent-2)",
  grammar_shift: "var(--change)",
  semantic_drift: "#c88dff",
  borrow: "#ffb473",
  grammaticalize: "#7be0b5",
  chain_shift: "#ff8fd4",
};

const KIND_LABEL: Record<LanguageEvent["kind"], string> = {
  sound_change: "sound",
  coinage: "coin",
  grammar_shift: "grammar",
  semantic_drift: "meaning",
  borrow: "borrow",
  grammaticalize: "gram",
  chain_shift: "chain",
};

export function EventsLog() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selected = selectedLangId ? state.tree[selectedLangId]?.language : undefined;

  if (!selected) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12 }}>
        Select a language to see its history.
      </div>
    );
  }

  const events = selected.events.slice().reverse();

  return (
    <div style={{ fontSize: 12 }}>
      <div style={{ marginBottom: 6, color: "var(--muted)" }}>
        {selected.name} · {events.length} events
      </div>
      {events.length === 0 && (
        <div style={{ color: "var(--muted)" }}>
          No events yet — run the simulation to see this language's history.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {events.map((e, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 60px 1fr",
              gap: 6,
              padding: "3px 4px",
              borderBottom: "1px solid var(--border)",
              fontFamily: "'SF Mono', Menlo, monospace",
              fontSize: 11,
            }}
          >
            <span style={{ color: "var(--muted)" }}>g{e.generation}</span>
            <span style={{ color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
            <span>{e.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
