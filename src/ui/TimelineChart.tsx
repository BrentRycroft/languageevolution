import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useSimStore } from "../state/store";
import { formToString, levenshtein } from "../engine/phonology/ipa";

export function TimelineChart() {
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);
  const history = useSimStore((s) => s.history);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const generation = useSimStore((s) => s.state.generation);

  const data = useMemo(() => {
    if (!selectedLangId || !selectedMeaning) return [];
    const entries = history[selectedLangId]?.[selectedMeaning] ?? [];
    const seed = seedForms[selectedMeaning];
    if (!seed) return [];
    return entries.map((e) => ({
      generation: e.generation,
      distance: levenshtein(e.form, seed),
      form: formToString(e.form),
    }));
  }, [history, selectedLangId, selectedMeaning, seedForms]);

  const label =
    selectedLangId && selectedMeaning
      ? `${selectedMeaning} in ${selectedLangId} @ gen ${generation}`
      : "Click a lexicon cell to trace a word.";

  if (data.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>
        {label}
      </div>
    );
  }

  const last = data[data.length - 1]!;

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
        {label} — current: <span style={{ color: "var(--accent)" }}>{last.form}</span> (distance {last.distance})
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
            <CartesianGrid stroke="#2a2f3a" strokeDasharray="3 3" />
            <XAxis
              dataKey="generation"
              stroke="#8a93a6"
              fontSize={11}
              label={{ value: "generation", position: "insideBottom", offset: -3, fill: "#8a93a6", fontSize: 10 }}
            />
            <YAxis stroke="#8a93a6" fontSize={11} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#1f232c", border: "1px solid #2a2f3a", fontSize: 12 }}
              labelStyle={{ color: "#8a93a6" }}
              formatter={(_v: number, _n: string, p: { payload?: { form?: string; distance?: number } }) => [
                `${p.payload?.form ?? ""} (d=${p.payload?.distance ?? 0})`,
                "form",
              ]}
            />
            <Line
              type="stepAfter"
              dataKey="distance"
              stroke="#7cc4ff"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
