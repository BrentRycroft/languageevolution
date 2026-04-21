import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";

export function GrammarView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectLanguage = useSimStore((s) => s.selectLanguage);

  const leaves = leafIds(state.tree);

  const selected = selectedLangId ? state.tree[selectedLangId]?.language : undefined;

  return (
    <div style={{ fontSize: 12 }}>
      {selected ? (
        <>
          <div
            style={{
              marginBottom: 8,
              fontSize: 13,
              color: selected.extinct ? "var(--muted)" : "var(--text)",
            }}
          >
            <strong>{selected.name}</strong>{" "}
            {selected.extinct && <span style={{ color: "var(--danger)" }}>(extinct)</span>}
          </div>
          <GrammarFeatureList grammar={selected.grammar} />
        </>
      ) : (
        <div style={{ color: "var(--muted)" }}>Select a language to view grammar.</div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {leaves.map((id) => {
          const lang = state.tree[id]!.language;
          return (
            <button
              key={id}
              onClick={() => selectLanguage(id)}
              style={{
                opacity: lang.extinct ? 0.5 : 1,
                background: id === selectedLangId ? "var(--accent)" : undefined,
                color: id === selectedLangId ? "#0a1520" : undefined,
              }}
            >
              {lang.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GrammarFeatureList({ grammar }: { grammar: import("../engine/types").GrammarFeatures }) {
  const rows: Array<[string, string]> = [
    ["word order", grammar.wordOrder],
    ["affix position", grammar.affixPosition],
    ["plural marking", grammar.pluralMarking],
    ["tense marking", grammar.tenseMarking],
    ["case", grammar.hasCase ? "yes" : "no"],
    ["gender count", String(grammar.genderCount)],
  ];
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 12,
      }}
    >
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: "3px 6px", color: "var(--muted)" }}>{k}</td>
            <td style={{ padding: "3px 6px", color: "var(--text)" }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
