import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import {
  retentionMatrix,
  swadeshRetentionVsSeed,
} from "../engine/semantics/lexicostat";

/**
 * Phase 35 Tranche 35a: lexicostatistic + glottochronological view.
 *
 * Two side-by-side panels:
 * - **Pairwise retention heatmap**: each cell is the share of
 *   Swadesh-100 items where two alive leaves still have phonologically-
 *   close cognates. Diagonal is 100%; sister daughters that just
 *   diverged should be ~95%; long-separated branches drop toward 30-50%.
 * - **Glottochronology curve**: each alive leaf's retention against
 *   the seed proto-lexicon, plotted as % over generations.
 */
export function LexicostatView() {
  const state = useSimStore((s) => s.state);
  const config = useSimStore((s) => s.config);

  const aliveLeaves = useMemo(
    () => leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct).sort(),
    [state.tree],
  );
  const matrix = useMemo(
    () => retentionMatrix(state.tree, aliveLeaves),
    [state.tree, aliveLeaves],
  );
  const seedRetentions = useMemo(() => {
    const out: Array<{ id: string; name: string; retention: number; attested: number }> = [];
    for (const id of aliveLeaves) {
      const lang = state.tree[id]!.language;
      const r = swadeshRetentionVsSeed(lang, config.seedLexicon);
      out.push({ id, name: lang.name, retention: r.retention, attested: r.attested });
    }
    out.sort((a, b) => b.retention - a.retention);
    return out;
  }, [state.tree, aliveLeaves, config.seedLexicon]);

  if (aliveLeaves.length < 2) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>
        Need ≥ 2 alive leaves for a lexicostatistic comparison.
      </div>
    );
  }

  return (
    <div style={{ fontSize: "var(--fs-2)", padding: 8 }}>
      <section style={{ marginBottom: 24 }}>
        <h3 style={{ margin: "0 0 8px" }}>Pairwise Swadesh retention</h3>
        <div className="t-muted" style={{ fontSize: "var(--fs-1)", marginBottom: 8 }}>
          Each cell: share of Swadesh-100 meanings whose forms are
          phonologically close (Levenshtein-near) between the two
          languages. Diagonal is 100% (a language is cognate with
          itself); sister daughters fresh off a split should sit near
          90-95%; long-separated branches drop toward 30-50%.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="paradigm-table" style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ width: 80 }}></th>
                {matrix.ids.map((id) => (
                  <th key={id} style={{ width: 60, padding: "2px 4px" }}>
                    {state.tree[id]!.language.name.slice(0, 8)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.ids.map((rowId, i) => (
                <tr key={rowId}>
                  <td style={{ color: "var(--muted)", padding: "2px 4px", fontWeight: 600 }}>
                    {state.tree[rowId]!.language.name.slice(0, 8)}
                  </td>
                  {matrix.ids.map((_, j) => {
                    const v = matrix.matrix[i]![j]!;
                    const a = matrix.attested[i]![j]!;
                    const pct = (v * 100).toFixed(0);
                    // Color: bright green at 100%, fading to red at 0%.
                    const hue = Math.round(v * 120);
                    const color = `hsl(${hue} 70% ${i === j ? 30 : 24}%)`;
                    return (
                      <td
                        key={j}
                        title={`${pct}% cognate over ${a} attested Swadesh meanings`}
                        style={{
                          background: color,
                          color: "white",
                          textAlign: "center",
                          padding: "4px 6px",
                        }}
                      >
                        {pct}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 style={{ margin: "0 0 8px" }}>Glottochronology — retention vs proto</h3>
        <div className="t-muted" style={{ fontSize: "var(--fs-1)", marginBottom: 8 }}>
          Per-leaf share of Swadesh-100 meanings whose form is still
          phonologically close to the proto. Classical Swadesh
          prediction: ~80% retention per millennium of separation.
          With {(config.yearsPerGeneration ?? 25)} years per gen and
          gen {state.generation}, the proto is{" "}
          {state.generation * (config.yearsPerGeneration ?? 25)} years
          ago.
        </div>
        <table className="paradigm-table" style={{ width: "100%", fontSize: 11 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Language</th>
              <th style={{ textAlign: "right" }}>Retention</th>
              <th style={{ textAlign: "right" }}>Attested</th>
              <th style={{ textAlign: "left", width: 200 }}>Bar</th>
            </tr>
          </thead>
          <tbody>
            {seedRetentions.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td style={{ textAlign: "right", fontFamily: "var(--font-mono)" }}>
                  {(r.retention * 100).toFixed(1)}%
                </td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>{r.attested}/100</td>
                <td>
                  <div style={{ height: 8, background: "var(--panel-2)", width: 200, borderRadius: 3 }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${r.retention * 100}%`,
                        background: `hsl(${Math.round(r.retention * 120)} 70% 50%)`,
                        borderRadius: 3,
                      }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
