import { useState, useMemo } from "react";
import { useSimStore } from "../state/store";
import { findCognates } from "../engine/translator/cognates";
import { reconstructProtoForm } from "../engine/tree/reconstruction";
import { formatForm } from "../engine/phonology/display";
import { ListSearch } from "./ListSearch";
import { CopyButton } from "./CopyButton";
import { downloadAs, toCsv, slugForFile } from "./exportUtils";

/**
 * Cognate-set explorer.
 *
 * Type a meaning; show every daughter language's form for that meaning,
 * mark extinct ones, and surface the MSA-reconstructed proto-form at the
 * top with its confidence and attestation count.
 *
 * Reuses:
 *   - engine/translator/cognates.ts findCognates (cross-tree lookup)
 *   - engine/tree/reconstruction.ts reconstructProtoForm (MSA-based,
 *     19c-7)
 *   - ui/ListSearch + CopyButton + exportUtils.
 */
export function CognateExplorer() {
  const tree = useSimStore((s) => s.state.tree);
  const rootId = useSimStore((s) => s.state.rootId);
  const script = useSimStore((s) => s.displayScript);
  const [meaning, setMeaning] = useState("water");

  const allMeanings = useMemo(() => {
    const set = new Set<string>();
    for (const id of Object.keys(tree)) {
      for (const m of Object.keys(tree[id]!.language.lexicon)) set.add(m);
    }
    return Array.from(set).sort();
  }, [tree]);

  const cognates = useMemo(
    () => (meaning.trim() ? findCognates(tree, meaning.trim().toLowerCase(), script) : []),
    [tree, meaning, script],
  );

  const proto = useMemo(() => {
    if (!meaning.trim()) return null;
    return reconstructProtoForm(tree, rootId, meaning.trim().toLowerCase());
  }, [tree, rootId, meaning]);

  const totalLeaves = cognates.length;
  const aliveAttesting = cognates.filter((c) => !c.extinct && c.form !== "—").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: 4 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Cognate set</h4>
        <ListSearch
          value={meaning}
          onChange={setMeaning}
          placeholder="Meaning (e.g. water, see, mother)…"
          label="Meaning to look up across the tree"
          style={{ flex: 1, minWidth: 220, maxWidth: 320 }}
        />
        <span className="t-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
          {meaning.trim()
            ? `${aliveAttesting}/${totalLeaves} languages attest`
            : `${allMeanings.length} known meanings`}
        </span>
      </header>

      {proto && (
        <div
          style={{
            padding: 10,
            background: "var(--panel-2)",
            border: "1px solid var(--accent-soft)",
            borderRadius: "var(--r-2)",
          }}
        >
          <div className="label-line" style={{ marginBottom: 4 }}>
            reconstructed proto-form (MSA-aligned)
          </div>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--fs-3)",
              color: "var(--accent)",
            }}
          >
            *{formatForm(proto.form, tree[rootId]!.language, script, meaning)}
          </div>
          <div className="t-muted" style={{ fontSize: 11, marginTop: 4 }}>
            confidence {(proto.confidence * 100).toFixed(0)}% · attested in {proto.attestedIn}/
            {proto.totalDescendants} descendants
          </div>
        </div>
      )}

      {cognates.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            justifyContent: "flex-end",
          }}
        >
          <CopyButton
            text={() =>
              cognates
                .map((c) => `${c.languageName}\t${c.form}${c.extinct ? "\t(extinct)" : ""}`)
                .join("\n")
            }
            title="Copy cognate set as TSV"
          />
          <button
            type="button"
            className="ghost"
            style={{ fontSize: 11, padding: "2px 8px" }}
            onClick={() => {
              const rows = cognates.map((c) => [
                c.languageName,
                c.form,
                c.extinct ? "extinct" : "alive",
              ]);
              const csv = toCsv(["language", "form", "status"], rows);
              downloadAs(`cognates-${slugForFile(meaning)}.csv`, csv, "text/csv;charset=utf-8");
            }}
            title="Download cognate set as CSV"
          >
            CSV
          </button>
        </div>
      )}

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
        <thead>
          <tr className="t-muted">
            <th style={{ textAlign: "left", padding: "4px 6px" }}>language</th>
            <th style={{ textAlign: "left", padding: "4px 6px" }}>form</th>
          </tr>
        </thead>
        <tbody>
          {cognates.map((c) => {
            const lang = tree[c.languageId]?.language;
            const chain = lang?.wordOriginChain?.[meaning.trim().toLowerCase()];
            const alts = lang?.altForms?.[meaning.trim().toLowerCase()] ?? [];
            return (
              <tr key={c.languageId} style={{ opacity: c.extinct ? 0.5 : 1 }}>
                <td style={{ padding: "3px 6px" }}>
                  {c.languageName}
                  {c.extinct && (
                    <span style={{ marginLeft: 4, color: "var(--danger)" }} title="extinct">
                      ×
                    </span>
                  )}
                </td>
                <td style={{ padding: "3px 6px", color: "var(--accent)" }}>
                  {c.form}
                  {chain && chain.from && chain.via && (
                    <span
                      className="t-muted"
                      style={{ marginLeft: 6, fontSize: 11 }}
                      title={`Derivation chain: ${chain.from} + ${chain.via}`}
                    >
                      ← {chain.from} + {chain.via}
                    </span>
                  )}
                  {alts.length > 0 && lang && (
                    <span
                      className="t-muted"
                      style={{ marginLeft: 6, fontSize: 11 }}
                      title="Alternative forms (synonyms)"
                    >
                      (also: {alts
                        .map((alt) => formatForm(alt, lang, script, meaning.trim().toLowerCase()))
                        .join(", ")})
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
          {meaning.trim() && cognates.length === 0 && (
            <tr>
              <td colSpan={2} style={{ padding: "8px 6px", color: "var(--muted)" }}>
                No language has a form for "{meaning.trim()}".
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
