import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { levenshtein } from "../engine/phonology/ipa";

function tempoBadge(conservatism: number): { icon: string; label: string; hue: number } {
  // 🐢 slow/conservative • ⏱ balanced • 🐇 fast/innovative
  if (conservatism >= 1.3) return { icon: "🐢", label: "conservative", hue: 200 };
  if (conservatism <= 0.7) return { icon: "🐇", label: "innovative", hue: 30 };
  return { icon: "⏱", label: "balanced", hue: 120 };
}

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
      conservatism: lang.conservatism,
    };
  });

  return (
    <div style={{ fontSize: 11, color: "var(--muted)" }}>
      <div>
        gen {state.generation} · {alive.length} alive
        {extinct.length > 0 ? ` · ${extinct.length} extinct` : ""}
      </div>
      <table className="stats-table">
        <thead>
          <tr>
            <th>lang</th>
            <th style={{ textAlign: "center" }}>tempo</th>
            <th style={{ textAlign: "right" }}>age</th>
            <th style={{ textAlign: "right" }}>words</th>
            <th style={{ textAlign: "right" }}>δ</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => {
            const badge = tempoBadge(s.conservatism);
            return (
              <tr key={s.id}>
                <td style={{ color: "var(--text)" }}>{s.name}</td>
                <td
                  style={{ textAlign: "center" }}
                  title={`${badge.label} (conservatism ${s.conservatism.toFixed(2)})`}
                >
                  {badge.icon}
                </td>
                <td style={{ textAlign: "right" }}>{s.age}</td>
                <td style={{ textAlign: "right" }}>{s.words}</td>
                <td style={{ textAlign: "right" }}>{s.mean.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
