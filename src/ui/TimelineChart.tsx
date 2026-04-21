import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { useSimStore } from "../state/store";
import { formToString, levenshtein } from "../engine/phonology/ipa";

const COLORS = ["#7cc4ff", "#ffcc66", "#c88dff", "#7be07b", "#ff8a9a"];

export function TimelineChart() {
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const meanings = useSimStore((s) => s.timelineMeanings);
  const history = useSimStore((s) => s.history);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const generation = useSimStore((s) => s.state.generation);
  const toggleTimelineMeaning = useSimStore((s) => s.toggleTimelineMeaning);
  const allMeanings = useMemo(() => Object.keys(seedForms).sort(), [seedForms]);

  const data = useMemo(() => {
    if (!selectedLangId || meanings.length === 0) return [];
    const byGen = new Map<number, Record<string, number | string>>();
    for (const m of meanings) {
      const entries = history[selectedLangId]?.[m] ?? [];
      const seed = seedForms[m];
      if (!seed) continue;
      for (const e of entries) {
        let row = byGen.get(e.generation);
        if (!row) {
          row = { generation: e.generation };
          byGen.set(e.generation, row);
        }
        row[m] = levenshtein(e.form, seed);
        row[`${m}_form`] = formToString(e.form);
      }
    }
    return Array.from(byGen.values()).sort(
      (a, b) => (a.generation as number) - (b.generation as number),
    );
  }, [history, selectedLangId, meanings, seedForms]);

  const label =
    selectedLangId && meanings.length > 0
      ? `${meanings.length} meaning${meanings.length === 1 ? "" : "s"} in ${selectedLangId} @ gen ${generation}`
      : "Click a lexicon cell to trace a word.";

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 6,
          fontFamily: "'SF Mono', Menlo, monospace",
        }}
      >
        {label}
      </div>
      <details style={{ marginBottom: 6, fontSize: 11 }}>
        <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
          ± meanings on chart ({meanings.length})
        </summary>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginTop: 4,
            maxHeight: 120,
            overflow: "auto",
          }}
        >
          {allMeanings.map((m) => {
            const active = meanings.includes(m);
            return (
              <button
                key={m}
                onClick={() => toggleTimelineMeaning(m)}
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  background: active ? "var(--accent)" : "var(--panel-2)",
                  color: active ? "#0a1520" : "var(--text)",
                  borderColor: active ? "var(--accent)" : "var(--border)",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </details>
      {data.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>No history yet.</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
              <XAxis
                dataKey="generation"
                stroke="#8a93a6"
                fontSize={11}
              />
              <YAxis stroke="#8a93a6" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "#1f232c", border: "1px solid #2a2f3a", fontSize: 12 }}
                labelStyle={{ color: "#8a93a6" }}
                formatter={(value: number, name: string, entry: { payload?: Record<string, unknown> }) => {
                  const form = entry.payload?.[`${name}_form`];
                  return [`${form ?? ""} (d=${value})`, name];
                }}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "var(--muted)" }}
              />
              {meanings.map((m, i) => (
                <Line
                  key={m}
                  type="stepAfter"
                  dataKey={m}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
