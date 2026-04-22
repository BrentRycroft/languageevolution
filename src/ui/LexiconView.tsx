import { useEffect, useMemo, useRef } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { formToString } from "../engine/phonology/ipa";

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

  const allLeaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const aliveLeaves = useMemo(
    () => allLeaves.filter((id) => !state.tree[id]!.language.extinct),
    [allLeaves, state.tree],
  );
  const starredSet = useMemo(() => new Set(starred), [starred]);
  const visibleLeaves = useMemo(() => {
    if (filter === "alive") return aliveLeaves;
    if (filter === "starred") return allLeaves.filter((id) => starredSet.has(id));
    return allLeaves;
  }, [filter, aliveLeaves, allLeaves, starredSet]);

  const meanings = useMemo(() => Object.keys(seedForms).sort(), [seedForms]);

  const prevCellsRef = useRef<Map<string, string>>(new Map());
  const justChangedRef = useRef<Set<string>>(new Set());

  const currentCells = useMemo(() => {
    const m = new Map<string, string>();
    for (const lid of visibleLeaves) {
      const lex = state.tree[lid]!.language.lexicon;
      for (const meaning of meanings) {
        const form = lex[meaning];
        if (form) m.set(`${lid}|${meaning}`, formToString(form));
      }
    }
    return m;
  }, [state, visibleLeaves, meanings]);

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
        {hiddenCount > 0 && (
          <span className="lexicon-filter-hint">
            {hiddenCount} hidden
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {visibleLeaves.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: 12, padding: 12 }}>
            {filter === "starred"
              ? "No languages starred yet. Click ☆ next to a column header to star a language."
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
                  const isExtinct = !!node.language.extinct;
                  return (
                    <th
                      key={lid}
                      onClick={() => selectLanguage(lid)}
                      className={selectedLangId === lid ? "selected-col" : ""}
                      style={{
                        opacity: isExtinct ? 0.6 : 1,
                      }}
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
                        {isExtinct && <span className="lexicon-extinct-mark">×</span>}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {meanings.map((meaning) => (
                <tr key={meaning}>
                  <td className="meaning" onClick={() => selectMeaning(meaning)}>
                    {meaning}
                  </td>
                  {visibleLeaves.map((lid) => {
                    const key = `${lid}|${meaning}`;
                    const form = currentCells.get(key) ?? "";
                    const isChanged = justChangedRef.current.has(key);
                    const isSelected = selectedLangId === lid && selectedMeaning === meaning;
                    return (
                      <td
                        key={lid}
                        className={`${isChanged ? "changed" : ""} ${isSelected ? "selected" : ""}`}
                        onClick={() => {
                          selectLanguage(lid);
                          selectMeaning(meaning);
                        }}
                      >
                        {form}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
