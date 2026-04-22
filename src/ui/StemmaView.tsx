import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { buildStemma, stemmaMatrix, type StemmaNode } from "../engine/analysis/stemma";

/**
 * Rule-similarity stemma: an agglomerative tree built from pairwise Jaccard
 * distance over active-rule template ids. Distinct from the phylogeny tree
 * (which is the split history) — this reveals convergence/areal patterns.
 */
export function StemmaView() {
  const state = useSimStore((s) => s.state);
  const { root, edges } = useMemo(() => {
    return { root: buildStemma(state.tree), edges: stemmaMatrix(state.tree) };
  }, [state]);

  if (!root) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>
        No living languages to analyse yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: "var(--fs-1)", color: "var(--muted)" }}>
        Branches group languages by shared procedural rules. Siblings share
        more rule templates than cousins. Distance = 1 − Jaccard similarity
        over active-rule templates.
      </div>
      <div className="stemma-wrap">
        <StemmaTree node={root} />
      </div>
      <div style={{ fontSize: "var(--fs-1)" }}>
        <h5 style={{ margin: "0 0 6px", color: "var(--muted)" }}>
          Pairwise rule distance
        </h5>
        <table className="stemma-pairs">
          <thead>
            <tr>
              <th>A</th>
              <th>B</th>
              <th>distance</th>
            </tr>
          </thead>
          <tbody>
            {edges.slice(0, 20).map((e) => (
              <tr key={`${e.a}|${e.b}`}>
                <td>{state.tree[e.a]!.language.name}</td>
                <td>{state.tree[e.b]!.language.name}</td>
                <td className="num">{e.distance.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StemmaTree({ node, depth = 0 }: { node: StemmaNode; depth?: number }) {
  const isLeaf = node.children.length === 0;
  return (
    <div className="stemma-node" style={{ marginLeft: depth === 0 ? 0 : 16 }}>
      {isLeaf ? (
        <span className="stemma-leaf">{node.name}</span>
      ) : (
        <>
          <span className="stemma-branch">
            ┬─ d={node.distance.toFixed(2)}
          </span>
          {node.children.map((c) => (
            <StemmaTree key={c.id} node={c} depth={depth + 1} />
          ))}
        </>
      )}
    </div>
  );
}
