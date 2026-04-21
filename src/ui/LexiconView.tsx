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

  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const meanings = useMemo(() => Object.keys(seedForms).sort(), [seedForms]);

  const prevCellsRef = useRef<Map<string, string>>(new Map());
  const justChangedRef = useRef<Set<string>>(new Set());

  const currentCells = useMemo(() => {
    const m = new Map<string, string>();
    for (const lid of leaves) {
      const lex = state.tree[lid]!.language.lexicon;
      for (const meaning of meanings) {
        const form = lex[meaning];
        if (form) m.set(`${lid}|${meaning}`, formToString(form));
      }
    }
    return m;
  }, [state, leaves, meanings]);

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

  return (
    <table className="lexicon-table">
      <thead>
        <tr>
          <th>meaning</th>
          {leaves.map((lid) => {
            const node = state.tree[lid]!;
            return (
              <th
                key={lid}
                onClick={() => selectLanguage(lid)}
                style={{
                  cursor: "pointer",
                  color: selectedLangId === lid ? "var(--accent)" : undefined,
                }}
              >
                {node.language.name}
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
            {leaves.map((lid) => {
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
  );
}
