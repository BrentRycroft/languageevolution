import { useMemo } from "react";
import { useSimStore } from "../state/store";
import type { GeneratedRule } from "../engine/phonology/generated";

function shortId(id: string): string {
  const parts = id.split(".");
  if (parts.length <= 2) return id;
  return parts.slice(2).join(".");
}

function ruleExamples(rule: GeneratedRule): string {
  const pairs = Object.entries(rule.outputMap)
    .filter(([from, to]) => from !== to)
    .slice(0, 5)
    .map(([from, to]) => `${from} → ${to === "" ? "Ø" : to}`);
  return pairs.join("  ");
}

function contextSummary(rule: GeneratedRule): string {
  const parts: string[] = [];
  if (rule.context.locus === "intervocalic") parts.push("V_V");
  if (rule.context.locus === "edge") parts.push("# _ #");
  if (rule.context.position === "initial") parts.push("# _");
  if (rule.context.position === "final") parts.push("_ #");
  if (rule.context.position === "medial") parts.push("medial");
  if (rule.context.before && typeof rule.context.before === "object") {
    parts.push(`after ${describeQuery(rule.context.before)}`);
  }
  if (rule.context.after && typeof rule.context.after === "object") {
    parts.push(`before ${describeQuery(rule.context.after)}`);
  }
  return parts.length > 0 ? parts.join(", ") : "anywhere";
}

function describeQuery(q: Record<string, unknown>): string {
  const kv: string[] = [];
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined) continue;
    kv.push(`${k}:${v}`);
  }
  return `[${kv.join(", ")}]`;
}

export function SoundLawsView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const generation = useSimStore((s) => s.state.generation);
  const ids = useMemo(() => Object.keys(state.tree), [state.tree]);
  const lang =
    (selectedLangId && state.tree[selectedLangId]?.language) ||
    state.tree[ids[ids.length - 1]!]?.language;

  if (!lang) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>
        No language selected.
      </div>
    );
  }

  const active = lang.activeRules ?? [];
  const retired = lang.retiredRules ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h4 style={{ margin: 0 }}>{lang.name}</h4>
        <span className="label-line">
          {active.length} active · {retired.length} retired · gen {generation}
        </span>
      </header>

      <section>
        <h5 style={{ marginBottom: 6 }}>Active sound laws</h5>
        {active.length === 0 ? (
          <ProtoOrEmpty langId={lang.id} state={state} />
        ) : (
          <table className="sound-laws-table">
            <thead>
              <tr>
                <th>family</th>
                <th>rule</th>
                <th>context</th>
                <th>examples</th>
                <th title="Age in generations">age</th>
                <th title="Rule strength [0, 1]">str</th>
              </tr>
            </thead>
            <tbody>
              {active
                .slice()
                .sort((a, b) => b.strength - a.strength)
                .map((r) => (
                  <tr key={r.id}>
                    <td className="family">{r.family}</td>
                    <td>{shortId(r.id)}</td>
                    <td className="ctx">{contextSummary(r)}</td>
                    <td className="examples">{ruleExamples(r)}</td>
                    <td className="num">{generation - r.birthGeneration}</td>
                    <td className="num">{r.strength.toFixed(2)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {retired.length > 0 && (
        <section>
          <h5 style={{ marginBottom: 6, color: "var(--muted)" }}>Retired</h5>
          <table className="sound-laws-table retired">
            <thead>
              <tr>
                <th>family</th>
                <th>rule</th>
                <th>context</th>
                <th>born</th>
                <th>died</th>
              </tr>
            </thead>
            <tbody>
              {retired
                .slice()
                .reverse()
                .slice(0, 20)
                .map((r) => (
                  <tr key={r.id}>
                    <td className="family">{r.family}</td>
                    <td>{shortId(r.id)}</td>
                    <td className="ctx">{contextSummary(r)}</td>
                    <td className="num">{r.birthGeneration}</td>
                    <td className="num">{r.deathGeneration ?? "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/**
 * Empty-state branch for the Active-sound-laws section. Splits the
 * "language has no laws" case into two messages:
 *
 *   - **Proto**: the root never gets procedural rules — by design,
 *     it's the frozen ancestor that daughters diverge from. So the
 *     usual "run the sim for a few dozen generations" copy is
 *     misleading (the user could run forever and Proto would still
 *     show 0). Surface a one-click jump to the first alive daughter.
 *   - **Daughter, no rules yet**: keep the original "run the sim"
 *     copy — this is the legitimate "you haven't stepped enough"
 *     state.
 */
function ProtoOrEmpty({
  langId,
  state,
}: {
  langId: string;
  state: import("../engine/types").SimulationState;
}) {
  const isProto = langId === state.rootId;
  const selectLanguage = useSimStore((s) => s.selectLanguage);
  if (!isProto) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)" }}>
        No procedurally-generated rules yet. Run the sim for a few dozen
        generations and the language will start inventing its own.
      </div>
    );
  }
  // Find the first alive daughter to suggest as a jump target.
  const aliveDaughter = Object.values(state.tree).find(
    (n) => n.parentId !== null && n.childrenIds.length === 0 && !n.language.extinct,
  );
  return (
    <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", display: "flex", flexDirection: "column", gap: 8 }}>
      <span>
        The proto-language is the frozen ancestor — daughters invent
        the sound laws, not Proto. Switch to a daughter to see its
        active rules.
      </span>
      {aliveDaughter && (
        <button
          className="primary"
          onClick={() => selectLanguage(aliveDaughter.language.id)}
          style={{ alignSelf: "flex-start" }}
        >
          Switch to {aliveDaughter.language.name}
        </button>
      )}
    </div>
  );
}
