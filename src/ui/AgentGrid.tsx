import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { agentAgreementPercent } from "../engine/agents/population";

function percentToColor(p: number): string {
  const h = 10 + p * 120;
  const l = 25 + p * 35;
  return `hsl(${h.toFixed(0)}, 70%, ${l.toFixed(0)}%)`;
}

export function AgentGrid() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);

  const lang = selectedLangId ? state.tree[selectedLangId]?.language : undefined;
  const pop = lang?.population;

  const info = useMemo(() => {
    if (!pop || !selectedMeaning) return null;
    const consensus = pop.consensusLexicon[selectedMeaning];
    const consensusKey = consensus?.join("") ?? "";
    return {
      agreement: agentAgreementPercent(pop, selectedMeaning),
      consensusKey,
      gridWidth: pop.gridWidth,
      cells: pop.agents.map((a) => {
        const form = a.lexicon[selectedMeaning]!;
        const key = form?.join("") ?? "";
        const matches = key === consensusKey;
        return { id: a.id, key, matches };
      }),
    };
  }, [pop, selectedMeaning]);

  if (!pop) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12 }}>
        {selectedLangId
          ? "Selected language has no population (agent mode off)."
          : "Select a language to see its agents."}
      </div>
    );
  }
  if (!info) return null;

  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
        agreement on <span style={{ color: "var(--accent)" }}>{selectedMeaning}</span>:{" "}
        <span style={{ color: "var(--text)" }}>{(info.agreement * 100).toFixed(0)}%</span>
        {" — "}
        <span style={{ fontFamily: "'SF Mono', Menlo, monospace" }}>{info.consensusKey}</span>
      </div>
      <div
        className="agent-grid"
        style={{
          gridTemplateColumns: `repeat(${info.gridWidth}, 16px)`,
        }}
      >
        {info.cells.map((c) => (
          <div
            key={c.id}
            className="agent-cell"
            title={`${c.id}: ${c.key}${c.matches ? " (consensus)" : ""}`}
            style={{
              background: c.matches
                ? percentToColor(1)
                : percentToColor(0.2),
              outline: c.matches ? "1px solid #7cc4ff" : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}
