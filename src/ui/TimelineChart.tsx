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
  ReferenceLine,
} from "recharts";
import { useSimStore } from "../state/store";
import { levenshtein } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import { leafIds } from "../engine/tree/split";
import { RulesTimeline } from "./RulesTimeline";

const COLORS = ["#7cc4ff", "#ffcc66", "#c88dff", "#7be07b", "#ff8a9a", "#5fd6c5", "#ff9f5a", "#b8a4ff"];

export function TimelineChart() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);
  const selectMeaning = useSimStore((s) => s.selectMeaning);
  const meanings = useSimStore((s) => s.timelineMeanings);
  const history = useSimStore((s) => s.history);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const generation = useSimStore((s) => s.state.generation);
  const toggleTimelineMeaning = useSimStore((s) => s.toggleTimelineMeaning);
  const allMeanings = useMemo(() => Object.keys(seedForms).sort(), [seedForms]);
  const mode = useSimStore((s) => s.timelineMode);
  const setMode = useSimStore((s) => s.setTimelineMode);
  const starred = useSimStore((s) => s.starredLangIds);
  const script = useSimStore((s) => s.displayScript);
  const scrubGen = useSimStore((s) => s.timelineScrubGeneration);
  const setScrubGen = useSimStore((s) => s.setTimelineScrubGeneration);
  const effectiveGen = scrubGen ?? generation;

  useEffect(() => {
    if (scrubGen !== null && scrubGen > generation) setScrubGen(null);
  }, [scrubGen, generation, setScrubGen]);

  type Series = {
    key: string;
    label: string;
    color: string;
    points: Array<{ generation: number; distance: number; form: string }>;
  };

  const series: Series[] = useMemo(() => {
    if (mode === "rules") return [];
    if (mode === "meanings") {
      if (!selectedLangId) return [];
      const selLang = state.tree[selectedLangId]?.language;
      return meanings.map((m, i) => {
        const entries = history[selectedLangId]?.[m] ?? [];
        const seed = seedForms[m];
        return {
          key: m,
          label: m,
          color: COLORS[i % COLORS.length]!,
          points: seed && selLang
            ? entries.map((e) => ({
                generation: e.generation,
                distance: levenshtein(e.form, seed),
                form: formatForm(e.form, selLang, script),
              }))
            : [],
        };
      });
    }
    // Cognates mode. No silent "water" fallback — caller shows an
    // inline picker if selectedMeaning is nullish.
    if (!selectedMeaning) return [];
    const meaning = selectedMeaning;
    const seed = seedForms[meaning];
    if (!seed) return [];
    const leaves = leafIds(state.tree);
    const starredSet = new Set(starred);
    const prioritised = new Set<string>();
    for (const id of starred) if (leaves.includes(id)) prioritised.add(id);
    if (selectedLangId && leaves.includes(selectedLangId)) prioritised.add(selectedLangId);
    for (const id of leaves) {
      if (prioritised.size >= 6) break;
      if (!state.tree[id]!.language.extinct) prioritised.add(id);
    }
    return Array.from(prioritised).map((id, i) => {
      const entries = history[id]?.[meaning] ?? [];
      const lang = state.tree[id]!.language;
      return {
        key: id,
        label: lang.name + (starredSet.has(id) ? " ★" : ""),
        color: COLORS[i % COLORS.length]!,
        points: entries.map((e) => ({
          generation: e.generation,
          distance: levenshtein(e.form, seed),
          form: formatForm(e.form, lang, script),
        })),
      };
    });
  }, [mode, selectedLangId, selectedMeaning, meanings, history, seedForms, state, starred, script]);

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

  // Oldest-retained generation across all visible series — lets us warn
  // the user when the 500-entry-per-meaning history ring buffer has
  // rolled over and the earliest recorded form is no longer gen 0.
  const oldestRetainedGen = useMemo(() => {
    let min = Infinity;
    for (const s of series) {
      for (const p of s.points) if (p.generation < min) min = p.generation;
    }
    return Number.isFinite(min) ? min : 0;
  }, [series]);

  // Compute Y-domain from the CLIPPED chart data (not the full history)
  // so scrubbing back doesn't leave the axis scaled for a future
  // divergence that hasn't happened yet at the scrub point.
  const yMax = useMemo(() => {
    let max = 0;
    for (const row of chartData) {
      for (const [k, v] of Object.entries(row)) {
        if (k === "generation") continue;
        if (typeof v === "number" && v > max) max = v;
      }
    }
    // Pad by ~15% and round up to an integer so the top tick reads cleanly.
    return Math.max(1, Math.ceil(max * 1.15));
  }, [chartData]);

  // Collect event markers within the scrub window for the vertical-guide
  // overlay. Shows rule births/retirements + taboo events on the selected
  // language (meanings/rules modes) or across all displayed languages
  // (cognates mode).
  const eventMarkers = useMemo(() => {
    if (chartData.length === 0) return [] as Array<{ generation: number; kind: string; description: string }>;
    const gens: Array<{ generation: number; kind: string; description: string }> = [];
    const cap = scrubGen ?? generation;
    const visit = (langId: string) => {
      const lang = state.tree[langId]?.language;
      if (!lang) return;
      for (const e of lang.events) {
        if (e.generation > cap) continue;
        if (
          e.kind === "sound_change" &&
          (e.description.startsWith("new sound law") ||
            e.description.startsWith("sound law retired"))
        ) {
          gens.push({ generation: e.generation, kind: "rule", description: e.description });
        } else if (e.kind === "semantic_drift" && e.description.startsWith("taboo:")) {
          gens.push({ generation: e.generation, kind: "taboo", description: e.description });
        }
      }
    };
    if (mode === "meanings" && selectedLangId) visit(selectedLangId);
    if (mode === "cognates") {
      for (const s of series) visit(s.key);
    }
    // Keep at most 40 markers to avoid overplotting.
    return gens.slice(-40);
  }, [chartData.length, mode, selectedLangId, series, state.tree, scrubGen, generation]);

  const genLabel = scrubGen !== null ? `gen ${scrubGen} (of ${generation})` : `gen ${generation}`;
  const headerLabel =
    mode === "meanings"
      ? selectedLangId
        ? `${meanings.length} meaning${meanings.length === 1 ? "" : "s"} in ${selectedLangId} @ ${genLabel}`
        : "Pick a language from the tree or lexicon."
      : mode === "cognates"
        ? selectedMeaning
          ? `"${selectedMeaning}" across ${series.length} language${series.length === 1 ? "" : "s"} @ ${genLabel}`
          : "Pick a meaning to see how it diverged across languages."
        : selectedLangId
          ? `sound-law history for ${selectedLangId} @ ${genLabel}`
          : "Pick a language to see its sound-law timeline.";

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
          {(["meanings", "cognates", "rules"] as const).map((m) => (
            <button
              key={m}
              className={mode === m ? "primary" : "ghost"}
              style={{ minHeight: 28, fontSize: "var(--fs-1)", borderRadius: 0 }}
              onClick={() => setMode(m)}
            >
              {m}
            </button>
          ))}
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
        {oldestRetainedGen > 0 && mode !== "rules" && (
          <span
            title={`Per-meaning history is capped at 500 entries. Earlier form changes (before gen ${oldestRetainedGen}) have been dropped from this view.`}
            style={{
              fontSize: 10,
              color: "#ffcc66",
              border: "1px solid #ffcc66",
              borderRadius: "var(--r-pill)",
              padding: "1px 6px",
              fontFamily: "var(--font-mono)",
            }}
          >
            history clipped before gen {oldestRetainedGen}
          </span>
        )}
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

      {mode === "cognates" && (
        <div
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            marginBottom: 6,
            fontSize: "var(--fs-1)",
          }}
        >
          <label style={{ color: "var(--muted)" }}>Meaning:</label>
          <select
            value={selectedMeaning ?? ""}
            onChange={(e) => selectMeaning(e.target.value || null)}
            aria-label="Meaning to trace across languages"
            style={{
              fontSize: "var(--fs-1)",
              padding: "2px 6px",
              minHeight: 24,
            }}
          >
            <option value="">— pick a meaning —</option>
            {allMeanings.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          {!selectedMeaning && (
            <span style={{ color: "#ffcc66" }}>
              No meaning selected — pick one above to draw cognate divergence lines.
            </span>
          )}
        </div>
      )}

      {mode === "rules" ? (
        <RulesTimeline
          langId={selectedLangId}
          maxGen={effectiveGen}
        />
      ) : chartData.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", padding: 12 }}>
          No history yet — run the simulation for a few generations.
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 5, right: 12, bottom: 5, left: 0 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis dataKey="generation" stroke="var(--muted)" fontSize={11} />
              <YAxis
                stroke="var(--muted)"
                fontSize={11}
                allowDecimals={false}
                domain={[0, yMax]}
              />
              {eventMarkers.map((e, i) => (
                <ReferenceLine
                  key={`ev-${i}-${e.generation}`}
                  x={e.generation}
                  stroke={
                    e.kind === "rule"
                      ? "var(--accent)"
                      : e.kind === "taboo"
                        ? "#ffcc66"
                        : "var(--muted)"
                  }
                  strokeDasharray="2 2"
                  strokeOpacity={0.35}
                />
              ))}
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
                  // Small dots on every recorded generation so users can
                  // pinpoint individual form changes. Active dot grows on
                  // hover — drives the tooltip.
                  dot={{ r: 2, stroke: s.color, fill: s.color }}
                  activeDot={{ r: 5 }}
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
