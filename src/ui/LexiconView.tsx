import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { formatForm } from "../engine/phonology/display";
import { ReproduceForm } from "./ReproduceForm";
import { useDebounced } from "./hooks/useDebounced";
import { ScriptPicker } from "./ScriptPicker";
import { clusterOf } from "../engine/semantics/clusters";
import { frequencyFor } from "../engine/lexicon/frequency";

export function LexiconView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);
  const selectLanguage = useSimStore((s) => s.selectLanguage);
  const selectMeaning = useSimStore((s) => s.selectMeaning);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const filter = useSimStore((s) => s.lexiconFilter);
  const setFilter = useSimStore((s) => s.setLexiconFilter);
  const starred = useSimStore((s) => s.starredLangIds);
  const toggleStar = useSimStore((s) => s.toggleStarredLang);
  const compare = useSimStore((s) => s.compareLangIds);
  const toggleCompare = useSimStore((s) => s.toggleCompareLang);
  const clearCompare = useSimStore((s) => s.clearCompareLangs);
  const search = useSimStore((s) => s.lexiconSearch);
  const setSearch = useSimStore((s) => s.setLexiconSearch);
  const sort = useSimStore((s) => s.lexiconSort);
  const setSort = useSimStore((s) => s.setLexiconSort);
  const groupByCluster = useSimStore((s) => s.lexiconGroupByCluster);
  const setGroupByCluster = useSimStore((s) => s.setLexiconGroupByCluster);
  const script = useSimStore((s) => s.displayScript);
  const [inspect, setInspect] = useState<{ langId: string; meaning: string } | null>(null);

  const allLeaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const aliveLeaves = useMemo(
    () => allLeaves.filter((id) => !state.tree[id]!.language.extinct),
    [allLeaves, state.tree],
  );
  const starredSet = useMemo(() => new Set(starred), [starred]);
  const compareSet = useMemo(() => new Set(compare), [compare]);
  const visibleLeaves = useMemo(() => {
    if (filter === "alive") return aliveLeaves;
    if (filter === "starred") return allLeaves.filter((id) => starredSet.has(id));
    if (filter === "compare") return allLeaves.filter((id) => compareSet.has(id));
    return allLeaves;
  }, [filter, aliveLeaves, allLeaves, starredSet, compareSet]);

  const allMeanings = useMemo(() => Object.keys(seedForms).sort(), [seedForms]);
  const debouncedSearch = useDebounced(search, 150);

  // Pre-compute "last changed gen" + frequency hint per meaning,
  // averaged across visible languages, for the non-alpha sorts.
  const sortKeyForMeaning = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of allMeanings) {
      if (sort === "frequency") {
        out[m] = -frequencyFor(m); // higher freq → smaller key (top of table)
      } else if (sort === "last-changed") {
        // Most-recently-changed comes first; aggregate over visible leaves.
        let maxGen = -1;
        for (const lid of visibleLeaves) {
          const g = state.tree[lid]?.language.lastChangeGeneration?.[m];
          if (typeof g === "number" && g > maxGen) maxGen = g;
        }
        out[m] = -maxGen;
      } else if (sort === "cluster") {
        out[m] = 0; // cluster ordering applied below as a string sort
      } else {
        out[m] = 0;
      }
    }
    return out;
    // visibleLeaves is the dependency but referenced via state.tree below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMeanings, sort, state.tree]);

  const meanings = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let filtered = q
      ? allMeanings.filter((m) => m.toLowerCase().includes(q))
      : allMeanings.slice();
    if (sort === "alpha") {
      filtered.sort();
    } else if (sort === "cluster") {
      filtered.sort((a, b) => {
        const ca = clusterOf(a) ?? "z-other";
        const cb = clusterOf(b) ?? "z-other";
        if (ca !== cb) return ca.localeCompare(cb);
        return a.localeCompare(b);
      });
    } else {
      filtered.sort((a, b) => {
        const ka = sortKeyForMeaning[a] ?? 0;
        const kb = sortKeyForMeaning[b] ?? 0;
        if (ka !== kb) return ka - kb;
        return a.localeCompare(b);
      });
    }
    return filtered;
  }, [allMeanings, debouncedSearch, sort, sortKeyForMeaning]);

  const prevCellsRef = useRef<Map<string, string>>(new Map());
  const justChangedRef = useRef<Set<string>>(new Set());

  const currentCells = useMemo(() => {
    const m = new Map<string, string>();
    for (const lid of visibleLeaves) {
      const lang = state.tree[lid]!.language;
      for (const meaning of meanings) {
        const form = lang.lexicon[meaning];
        if (!form) continue;
        m.set(`${lid}|${meaning}`, formatForm(form, lang, script));
      }
    }
    return m;
  }, [state, visibleLeaves, meanings, script]);

  const originGlyph = (origin: string | undefined): string => {
    if (!origin) return "";
    if (origin.startsWith("borrow:")) return "⟶";
    if (origin.startsWith("taboo:")) return "†";
    if (origin === "compound") return "+";
    if (origin === "derivation") return "·";
    if (origin === "reduplication") return "≈";
    if (origin === "ideophone") return "♪";
    if (origin === "blending") return "⋈";
    if (origin === "clipping") return "✂";
    if (origin === "calque") return "≡";
    if (origin === "conversion") return "↺";
    return "";
  };
  const originTitle = (origin: string | undefined): string => {
    if (!origin) return "Inherited from proto seed";
    if (origin.startsWith("borrow:")) return `Borrowed from ${origin.slice(7)}`;
    if (origin.startsWith("taboo:")) {
      const donor = origin.slice(6);
      return donor && donor !== "self"
        ? `Taboo replacement (via ${donor})`
        : "Taboo replacement (self-reduplication)";
    }
    if (origin === "compound") return "Compound coinage";
    if (origin === "derivation") return "Derived with affix";
    if (origin === "reduplication") return "Reduplicated form";
    if (origin === "ideophone") return "Ideophone — iconic form that resists regular sound change";
    if (origin === "blending") return "Blend of two existing words";
    if (origin === "clipping") return "Clipped from a longer form";
    if (origin === "calque") return "Calque (loan translation)";
    if (origin === "conversion") return "Zero-derivation from a cluster mate";
    return origin;
  };

  useEffect(() => {
    const changed = new Set<string>();
    for (const [k, v] of currentCells) {
      if (prevCellsRef.current.get(k) !== v && prevCellsRef.current.has(k)) {
        changed.add(k);
      }
    }
    justChangedRef.current = changed;
    prevCellsRef.current = new Map(currentCells);
  }, [currentCells]);

  const hiddenCount = allLeaves.length - visibleLeaves.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div className="lexicon-filter-bar">
        <FilterChip
          label="Alive"
          active={filter === "alive"}
          onClick={() => setFilter("alive")}
          count={aliveLeaves.length}
        />
        <FilterChip
          label="All"
          active={filter === "all"}
          onClick={() => setFilter("all")}
          count={allLeaves.length}
        />
        <FilterChip
          label="Starred"
          active={filter === "starred"}
          onClick={() => setFilter("starred")}
          count={starred.length}
        />
        <FilterChip
          label="Compare"
          active={filter === "compare"}
          onClick={() => setFilter("compare")}
          count={compare.length}
        />
        {filter === "compare" && compare.length > 0 && (
          <button
            className="ghost"
            style={{ fontSize: "var(--fs-1)", padding: "2px 8px", minHeight: 24 }}
            onClick={clearCompare}
          >
            clear
          </button>
        )}
        {hiddenCount > 0 && (
          <span className="lexicon-filter-hint">{hiddenCount} hidden</span>
        )}
        <div style={{ marginLeft: "auto" }}>
          <ScriptPicker />
        </div>
      </div>
      <div
        style={{
          display: "flex",
          gap: 6,
          alignItems: "center",
          padding: "4px 0 8px",
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          placeholder={`Search ${allMeanings.length} meanings…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search meanings"
          style={{ flex: "1 1 200px", fontSize: "var(--fs-2)" }}
        />
        <label style={{ fontSize: "var(--fs-1)", color: "var(--muted)" }}>
          sort:&nbsp;
          <select
            value={sort}
            onChange={(e) =>
              setSort(e.target.value as "alpha" | "cluster" | "frequency" | "last-changed")
            }
            aria-label="Sort meanings by"
          >
            <option value="alpha">alphabetic</option>
            <option value="cluster">cluster</option>
            <option value="frequency">frequency</option>
            <option value="last-changed">last changed</option>
          </select>
        </label>
        <label style={{ fontSize: "var(--fs-1)", color: "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
          <input
            type="checkbox"
            checked={groupByCluster}
            onChange={(e) => setGroupByCluster(e.target.checked)}
            aria-label="Group rows by cluster"
          />
          group by cluster
        </label>
      </div>
      {filter === "compare" && (
        <div
          style={{
            fontSize: "var(--fs-1)",
            color: "var(--muted)",
            padding: "2px 0 6px",
          }}
        >
          Pick 2–5 languages to compare. Column headers act as toggles.
        </div>
      )}
      {inspect && (
        <ReproduceForm
          langId={inspect.langId}
          meaning={inspect.meaning}
          onClose={() => setInspect(null)}
        />
      )}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {filter === "compare" && compare.length === 0 ? (
          <CompareEmptyPicker
            allLeaves={allLeaves}
            state={state}
            toggleCompare={toggleCompare}
          />
        ) : visibleLeaves.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", padding: 12 }}>
            {filter === "starred"
              ? "No languages starred yet. Click ☆ on a column header to star one."
              : "No languages match this filter."}
          </div>
        ) : (
          <table className="lexicon-table">
            <thead>
              <tr>
                <th>meaning</th>
                {visibleLeaves.map((lid) => {
                  const node = state.tree[lid]!;
                  const isStarred = starredSet.has(lid);
                  const isCompared = compareSet.has(lid);
                  const isExtinct = !!node.language.extinct;
                  return (
                    <th
                      key={lid}
                      onClick={() => {
                        if (filter === "compare") toggleCompare(lid);
                        else selectLanguage(lid);
                      }}
                      className={selectedLangId === lid ? "selected-col" : ""}
                      style={{ opacity: isExtinct ? 0.6 : 1 }}
                    >
                      <span className="lexicon-col-header">
                        <button
                          className={`star-btn ${isStarred ? "starred" : ""}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStar(lid);
                          }}
                          aria-label={`${isStarred ? "Unstar" : "Star"} ${node.language.name}`}
                          title={isStarred ? "Starred" : "Star this language"}
                        >
                          {isStarred ? "★" : "☆"}
                        </button>
                        <span>{node.language.name}</span>
                        {isCompared && filter !== "compare" && (
                          <span style={{ fontSize: "var(--fs-1)", color: "var(--accent)" }}>
                            ✓
                          </span>
                        )}
                        {isExtinct && <span className="lexicon-extinct-mark">×</span>}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows: React.ReactNode[] = [];
                let currentCluster: string | null = null;
                const colspan = visibleLeaves.length + 1;
                for (const meaning of meanings) {
                  if (groupByCluster) {
                    const cluster = clusterOf(meaning) ?? "other";
                    if (cluster !== currentCluster) {
                      currentCluster = cluster;
                      rows.push(
                        <tr key={`__group_${cluster}`} className="lexicon-cluster-row">
                          <td
                            colSpan={colspan}
                            style={{
                              fontSize: "var(--fs-1)",
                              color: "var(--muted)",
                              padding: "6px 6px 2px",
                              fontWeight: "var(--fw-semi)",
                            }}
                          >
                            {cluster}
                          </td>
                        </tr>,
                      );
                    }
                  }
                  rows.push(
                <tr key={meaning}>
                  <td className="meaning" onClick={() => selectMeaning(meaning)}>
                    {meaning}
                  </td>
                  {visibleLeaves.map((lid) => {
                    const key = `${lid}|${meaning}`;
                    const form = currentCells.get(key) ?? "";
                    const isChanged = justChangedRef.current.has(key);
                    const isSelected = selectedLangId === lid && selectedMeaning === meaning;
                    const origin = state.tree[lid]!.language.wordOrigin?.[meaning];
                    const glyph = originGlyph(origin);
                    return (
                      <td
                        key={lid}
                        className={`${isChanged ? "changed" : ""} ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          selectLanguage(lid);
                          selectMeaning(meaning);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (form) setInspect({ langId: lid, meaning });
                        }}
                        onDoubleClick={() => {
                          if (form) setInspect({ langId: lid, meaning });
                        }}
                        title={`${originTitle(origin)} — right-click or double-tap to inspect history`}
                      >
                        {form}
                        {glyph && (
                          <span className="origin-glyph" aria-hidden>{glyph}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>,
                  );
                }
                return rows;
              })()}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CompareEmptyPicker({
  allLeaves,
  state,
  toggleCompare,
}: {
  allLeaves: string[];
  state: ReturnType<typeof useSimStore.getState>["state"];
  toggleCompare: (id: string) => void;
}) {
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: "var(--fs-2)", color: "var(--muted)" }}>
        Tap any language to add it to the comparison. Up to 5 at a time works
        well on narrow screens.
      </div>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          marginTop: 4,
        }}
      >
        {allLeaves.map((id) => {
          const lang = state.tree[id]!.language;
          return (
            <button
              key={id}
              className="ghost"
              style={{
                padding: "6px 12px",
                fontSize: "var(--fs-2)",
                opacity: lang.extinct ? 0.5 : 1,
                borderColor: "var(--border)",
              }}
              onClick={() => toggleCompare(id)}
            >
              {lang.name}
              {lang.extinct ? " ×" : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      type="button"
      className={`lexicon-filter-chip ${active ? "active" : ""}`}
      onClick={onClick}
    >
      {label}
      <span className="lexicon-filter-chip-count">{count}</span>
    </button>
  );
}
