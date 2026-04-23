import { useMemo } from "react";
import { useSimStore } from "../state/store";
import type { GeneratedRule } from "../engine/phonology/generated";

const FAMILY_COLORS: Record<string, string> = {
  lenition: "#7cc4ff",
  fortition: "#ffcc66",
  place_assim: "#c88dff",
  palatalization: "#7be07b",
  vowel_shift: "#ff8a9a",
  vowel_reduction: "#5fd6c5",
  harmony: "#ff9f5a",
  deletion: "#b8a4ff",
  metathesis: "#d3d3d3",
  tone: "#ffd27a",
};

/**
 * Gantt-style rule-lifecycle view. Each row is one rule (active or retired)
 * for the selected language, with a horizontal band spanning its active
 * lifetime. Band opacity scales with the rule's current strength.
 */
export function RulesTimeline({
  langId,
  maxGen,
}: {
  langId: string | null;
  maxGen: number;
}) {
  const state = useSimStore((s) => s.state);
  const node = langId ? state.tree[langId] : null;

  const rows = useMemo(() => {
    if (!node) return [];
    const active = node.language.activeRules ?? [];
    const retired = node.language.retiredRules ?? [];
    const all: Array<{ rule: GeneratedRule; status: "active" | "retired" }> = [];
    for (const r of active) all.push({ rule: r, status: "active" });
    for (const r of retired) all.push({ rule: r, status: "retired" });
    // Sort by birth generation ascending so the reader can scan downward in time.
    all.sort((a, b) => a.rule.birthGeneration - b.rule.birthGeneration);
    return all;
  }, [node]);

  if (!node) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", padding: 12 }}>
        Pick a language to see its sound-law timeline.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", padding: 12 }}>
        No sound laws yet for {node.language.name}. Run more generations — new
        laws typically start landing around gen 8–16.
      </div>
    );
  }

  const span = Math.max(1, maxGen);

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
      <table className="rules-timeline">
        <thead>
          <tr>
            <th style={{ width: "18%" }}>family</th>
            <th style={{ width: "22%" }}>rule</th>
            <th>lifetime (gen 0 → {maxGen})</th>
          </tr>
        </thead>
        <tbody>
          {rows
            // Hide rules that hadn't been born yet at the scrub point —
            // previously they'd render at a negative `left` %, pushing
            // the bar off-screen and confusing the reader. Retired
            // rules whose death was also after the scrub point keep
            // showing; their bar is clamped below.
            .filter(({ rule }) => rule.birthGeneration <= maxGen)
            .map(({ rule, status }) => {
            const birth = Math.max(0, rule.birthGeneration);
            const rawDeath =
              status === "retired" ? rule.deathGeneration ?? maxGen : maxGen;
            // Clamp death at the scrub point so lifetimes don't spill
            // past the visible window.
            const death = Math.min(rawDeath, maxGen);
            const left = (birth / span) * 100;
            const width = Math.max(0.5, ((death - birth) / span) * 100);
            const color = FAMILY_COLORS[rule.family] ?? "#888";
            // Active rules use their live strength; retired rules fade.
            const opacity = status === "active" ? Math.max(0.2, rule.strength) : 0.35;
            const shortId = rule.id.split(".").slice(2).join(".") || rule.id;
            return (
              <tr key={rule.id}>
                <td className="family" style={{ color }}>
                  {rule.family}
                </td>
                <td title={rule.description}>{shortId}</td>
                <td className="bar-cell">
                  <div className="bar-track">
                    <div
                      className={`bar ${status === "retired" ? "retired" : ""}`}
                      style={{
                        left: `${left}%`,
                        width: `${width}%`,
                        background: color,
                        opacity,
                      }}
                      title={`${rule.description}\nborn: gen ${birth}\n${
                        status === "retired"
                          ? `retired: gen ${rule.deathGeneration}`
                          : `strength: ${rule.strength.toFixed(2)}`
                      }`}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
