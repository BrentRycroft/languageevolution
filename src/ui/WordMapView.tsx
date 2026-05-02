import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { formatForm } from "../engine/phonology/display";
import { ScriptPicker } from "./ScriptPicker";
import type { Word } from "../engine/types";

type SortMode = "form" | "senses-desc" | "born";

/**
 * Phase 21e: word-centric panel. Lists every Word in the selected
 * language with the meaning(s) it carries. The "homonyms" filter
 * surfaces the polysemous entries (≥2 senses) — the canonical English
 * "bank" / "light" / "bear" pattern.
 */
export function WordMapView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectLanguage = useSimStore((s) => s.selectLanguage);
  const script = useSimStore((s) => s.displayScript);

  const aliveLeaves = leafIds(state.tree).filter(
    (id) => !state.tree[id]!.language.extinct,
  );

  const [filter, setFilter] = useState<"all" | "homonyms" | "primitives">("all");
  const [sort, setSort] = useState<SortMode>("senses-desc");
  const [search, setSearch] = useState("");

  const lang = selectedLangId ? state.tree[selectedLangId]?.language : undefined;
  const words: Word[] = lang?.words ?? [];

  const filtered = useMemo(() => {
    let out = words.slice();
    if (filter === "homonyms") out = out.filter((w) => w.senses.length >= 2);
    else if (filter === "primitives") out = out.filter((w) => w.senses.length === 1);
    if (search.trim().length > 0) {
      const q = search.toLowerCase();
      out = out.filter(
        (w) =>
          w.formKey.toLowerCase().includes(q) ||
          w.senses.some((s) => s.meaning.toLowerCase().includes(q)),
      );
    }
    if (sort === "form") {
      out.sort((a, b) => a.formKey.localeCompare(b.formKey));
    } else if (sort === "senses-desc") {
      out.sort((a, b) => {
        const d = b.senses.length - a.senses.length;
        if (d !== 0) return d;
        return a.formKey.localeCompare(b.formKey);
      });
    } else {
      out.sort((a, b) => a.bornGeneration - b.bornGeneration);
    }
    return out;
  }, [words, filter, sort, search]);

  const totalWords = words.length;
  const polysemous = words.filter((w) => w.senses.length >= 2).length;
  const totalSenses = words.reduce((sum, w) => sum + w.senses.length, 0);

  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: "var(--muted)" }}>Language:</span>
          <select
            value={selectedLangId ?? ""}
            onChange={(e) => selectLanguage(e.target.value || null)}
          >
            {aliveLeaves.map((id) => {
              const l = state.tree[id]!.language;
              return (
                <option key={id} value={id}>
                  {l.name}
                </option>
              );
            })}
          </select>
        </label>
        <ScriptPicker />
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: "var(--muted)" }}>Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">all words ({totalWords})</option>
            <option value="homonyms">homonyms only ({polysemous})</option>
            <option value="primitives">single-sense ({totalWords - polysemous})</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: "var(--muted)" }}>Sort:</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
            <option value="senses-desc">most senses first</option>
            <option value="form">form (alphabetic)</option>
            <option value="born">born generation</option>
          </select>
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ color: "var(--muted)" }}>Search:</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="form or meaning…"
            style={{ minWidth: 140 }}
          />
        </label>
      </div>

      {!lang && (
        <div style={{ color: "var(--muted)" }}>
          Select a language to inspect its words.
        </div>
      )}

      {lang && words.length === 0 && (
        <div style={{ color: "var(--muted)" }}>
          This language has no <code>words</code> table yet (pre-Phase-21
          save). Run a few generations or load a fresh preset.
        </div>
      )}

      {lang && words.length > 0 && (
        <>
          <div style={{ color: "var(--muted)", marginBottom: 6 }}>
            <strong>{totalWords}</strong> word{totalWords === 1 ? "" : "s"} ·{" "}
            <strong>{polysemous}</strong> polysemous · <strong>{totalSenses}</strong>{" "}
            total sense{totalSenses === 1 ? "" : "s"}
            {polysemous > 0 && (
              <span>
                {" "}
                · avg{" "}
                <strong>{(totalSenses / totalWords).toFixed(2)}</strong> senses /
                word
              </span>
            )}
          </div>
          <table className="stats-table" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Form</th>
                <th style={{ textAlign: "left" }}>Senses</th>
                <th style={{ textAlign: "right" }}>Born</th>
                <th style={{ textAlign: "left" }}>Origin</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((w, i) => {
                const surface = formatForm(w.form, lang, script, w.senses[0]?.meaning);
                return (
                  <tr key={`${w.formKey}-${i}`}>
                    <td>
                      <strong>{surface}</strong>
                      {w.senses.length >= 2 && (
                        <span
                          style={{
                            marginLeft: 4,
                            fontSize: 10,
                            color: "var(--accent, #b08)",
                          }}
                          title={`${w.senses.length} senses (polysemy)`}
                        >
                          ×{w.senses.length}
                        </span>
                      )}
                    </td>
                    <td>
                      {w.senses.map((s, k) => (
                        <span key={s.meaning}>
                          {k > 0 && (
                            <span style={{ color: "var(--muted)" }}> · </span>
                          )}
                          <span
                            title={
                              (s.origin ? `origin: ${s.origin}` : "") +
                              (s.weight ? ` · weight: ${s.weight.toFixed(2)}` : "")
                            }
                            style={{
                              fontWeight:
                                k === w.primarySenseIndex ? 600 : 400,
                            }}
                          >
                            {s.meaning}
                            {s.origin === "sound-change-merger" && (
                              <span
                                style={{ color: "var(--accent, #b08)" }}
                                title="absorbed via sound-change merger"
                              >
                                {" "}
                                ⇇
                              </span>
                            )}
                            {s.origin === "polysemy" && (
                              <span
                                style={{ color: "var(--muted)" }}
                                title="attached as polysemy"
                              >
                                {" "}
                                ↔
                              </span>
                            )}
                          </span>
                        </span>
                      ))}
                    </td>
                    <td style={{ textAlign: "right", color: "var(--muted)" }}>
                      {w.bornGeneration}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{w.origin ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <div style={{ color: "var(--muted)", marginTop: 6 }}>
              showing first 500 of {filtered.length} matches — narrow the search
              to see more
            </div>
          )}
        </>
      )}
    </div>
  );
}
