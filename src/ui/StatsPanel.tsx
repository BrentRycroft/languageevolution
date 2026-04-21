import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { levenshtein } from "../engine/phonology/ipa";

export function StatsPanel() {
  const state = useSimStore((s) => s.state);
  const seed = useSimStore((s) => s.seedFormsByMeaning);

  const leaves = leafIds(state.tree);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);
  const extinct = leaves.filter((id) => state.tree[id]!.language.extinct);

  const meanings = Object.keys(seed);
  const stats = alive.map((id) => {
    const lang = state.tree[id]!.language;
    let total = 0;
    let count = 0;
    for (const m of meanings) {
      const form = lang.lexicon[m];
      const original = seed[m];
      if (form && original) {
        total += levenshtein(form, original);
        count++;
      }
    }
    return {
      id,
      name: lang.name,
      age: state.generation - lang.birthGeneration,
      changes: lang.enabledChangeIds.length,
      mean: count > 0 ? total / count : 0,
      words: Object.keys(lang.lexicon).length,
    };
  });

  return (
    <div style={{ fontSize: 11, color: "var(--muted)" }}>
      <div>
        gen {state.generation} · {alive.length} alive{extinct.length > 0 ? ` · ${extinct.length} extinct` : ""}
      </div>
      <table
        style={{
          width: "100%",
          marginTop: 6,
          fontSize: 11,
          fontFamily: "'SF Mono', Menlo, monospace",
          borderCollapse: "collapse",
        }}
      >
        <thead>
          <tr style={{ color: "var(--muted)" }}>
            <th style={{ textAlign: "left", padding: "2px 4px" }}>lang</th>
            <th style={{ textAlign: "right", padding: "2px 4px" }}>age</th>
            <th style={{ textAlign: "right", padding: "2px 4px" }}>rules</th>
            <th style={{ textAlign: "right", padding: "2px 4px" }}>words</th>
            <th style={{ textAlign: "right", padding: "2px 4px" }}>δ</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.id}>
              <td style={{ padding: "2px 4px", color: "var(--text)" }}>{s.name}</td>
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{s.age}</td>
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{s.changes}</td>
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{s.words}</td>
              <td style={{ padding: "2px 4px", textAlign: "right" }}>{s.mean.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
