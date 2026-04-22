import { useEffect, useMemo } from "react";
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
import { leafIds } from "../engine/tree/split";

const COLORS = ["#7cc4ff", "#ffcc66", "#c88dff", "#7be07b", "#ff8a9a", "#5fd6c5", "#ff9f5a", "#b8a4ff"];

export function TimelineChart() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);
  const meanings = useSimStore((s) => s.timelineMeanings);
  const history = useSimStore((s) => s.history);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const generation = useSimStore((s) => s.state.generation);
  const toggleTimelineMeaning = useSimStore((s) => s.toggleTimelineMeaning);
  const allMeanings = useMemo(() => Object.keys(seedForms).sort(), [seedForms]);
  const mode = useSimStore((s) => s.timelineMode);
  const setMode = useSimStore((s) => s.setTimelineMode);
  const starred = useSimStore((s) => s.starredLangIds);
  const scrubGen = useSimStore((s) => s.timelineScrubGeneration);
  const setScrubGen = useSimStore((s) => s.setTimelineScrubGeneration);
  const effectiveGen = scrubGen ?? generation;

  // If the live generation falls below the user's scrub point (e.g. reset),
  // drop back to live so the scrubber doesn't show a stale value.
  useEffect(() => {
    if (scrubGen !== null && scrubGen > generation) setScrubGen(null);
  }, [scrubGen, generation, setScrubGen]);

  // Series are either "meanings across one language" or "languages across one meaning".
  type Series = {
    key: string;
    label: string;
    color: string;
    points: Array<{ generation: number; distance: number; form: string }>;
  };

  const series: Series[] = useMemo(() => {
    if (mode === "meanings") {
      if (!selectedLangId) return [];
      return meanings.map((m, i) => {
        const entries = history[selectedLangId]?.[m] ?? [];
        const seed = seedForms[m];
        return {
          key: m,
          label: m,
          color: COLORS[i % COLORS.length]!,
          points: seed
            ? entries.map((e) => ({
                generation: e.generation,
                distance: levenshtein(e.form, seed),
                form: formToString(e.form),
              }))
            : [],
        };
      });
    }
    // Cognates mode: one meaning, many languages.
    const meaning = selectedMeaning ?? "water";
    const seed = seedForms[meaning];
    if (!seed) return [];
    const leaves = leafIds(state.tree);
    const starredSet = new Set(starred);
    // Pin starred first, then the selected language, then up to 4 alive by age.
    const prioritised = new Set<string>();
    for (const id of starred) if (leaves.includes(id)) prioritised.add(id);
    if (selectedLangId && leaves.includes(selectedLangId)) prioritised.add(selectedLangId);
    for (const id of leaves) {
      if (prioritised.size >= 6) break;
      if (!state.tree[id]!.language.extinct) prioritised.add(id);
    }
    return Array.from(prioritised).map((id, i) => {
      const entries = history[id]?.[meaning] ?? [];
      return {
        key: id,
        label:
          state.tree[id]!.language.name + (starredSet.has(id) ? " ★" : ""),
        color: COLORS[i % COLORS.length]!,
        points: entries.map((e) => ({
          generation: e.generation,
          distance: levenshtein(e.form, seed),
          form: formToString(e.form),
        })),
      };
    });
  }, [mode, selectedLangId, selectedMeaning, meanings, history, seedForms, state, starred]);

  const chartData = useMemo(() => {
    const byGen = new Map<number, Record<string, number | string>>();
    for (const s of series) {
      for (const p of s.points) {
        if (scrubGen !== null && p.generation > scrubGen) continue;
        let row = byGen.get(p.generation);
        if (!row) {
          row = { generation: p.generation };
          byGen.set(p.generation, row);
        }
        row[s.key] = p.distance;
        row[`${s.key}_form`] = p.form;
      }
    }
    return Array.from(byGen.values()).sort(
      (a, b) => (a.generation as number) - (b.generation as number),
    );
  }, [series, scrubGen]);

  const genLabel = scrubGen !== null ? `gen ${scrubGen} (of ${generation})` : `gen ${generation}`;
  const headerLabel =
    mode === "meanings"
      ? selectedLangId
        ? `${meanings.length} meaning${meanings.length === 1 ? "" : "s"} in ${selectedLangId} @ ${genLabel}`
        : "Pick a language from the tree or lexicon."
      : `"${selectedMeaning ?? "water"}" across ${series.length} language${series.length === 1 ? "" : "s"} @ ${genLabel}`;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 6,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-pill)",
            overflow: "hidden",
          }}
        >
          <button
            className={mode === "meanings" ? "primary" : "ghost"}
            style={{ minHeight: 28, fontSize: "var(--fs-1)", borderRadius: 0 }}
            onClick={() => setMode("meanings")}
          >
            meanings
          </button>
          <button
            className={mode === "cognates" ? "primary" : "ghost"}
            style={{ minHeight: 28, fontSize: "var(--fs-1)", borderRadius: 0 }}
            onClick={() => setMode("cognates")}
          >
            cognates
          </button>
        </div>
        <span
          style={{
            fontSize: "var(--fs-1)",
            color: "var(--muted)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {headerLabel}
        </span>
      </div>

      {mode === "meanings" && (
        <details style={{ marginBottom: 6, fontSize: "var(--fs-1)" }}>
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
                    minHeight: 22,
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
      )}

      {chartData.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", padding: 12 }}>
          No history yet — run the simulation for a few generations.
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="generation" stroke="var(--muted)" fontSize={11} />
              <YAxis stroke="var(--muted)" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  fontSize: "var(--fs-2)",
                  color: "var(--text)",
                }}
                labelStyle={{ color: "var(--muted)" }}
                formatter={(value: number, name: string, entry: { payload?: Record<string, unknown> }) => {
                  const form = entry.payload?.[`${name}_form`];
                  return [`${form ?? ""} (d=${value})`, name];
                }}
              />
              <Legend
                wrapperStyle={{
                  fontSize: "var(--fs-1)",
                  color: "var(--muted)",
                  paddingTop: 4,
                }}
              />
              {series.map((s) => (
                <Line
                  key={s.key}
                  type="stepAfter"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {generation >= 2 && (
        <div className="timeline-scrubber">
          <input
            type="range"
            min={0}
            max={generation}
            step={1}
            value={effectiveGen}
            onChange={(e) => {
              const v = Number(e.target.value);
              setScrubGen(v >= generation ? null : v);
            }}
            aria-label="Scrub to past generation"
          />
          {scrubGen !== null && (
            <button
              type="button"
              className="ghost"
              onClick={() => setScrubGen(null)}
              title="Follow live generation"
            >
              live
            </button>
          )}
        </div>
      )}
    </div>
  );
}
