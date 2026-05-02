import { useEffect, useMemo, useRef, useState } from "react";
import { useSimStore } from "../state/store";
import { formToString } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import { leafIds } from "../engine/tree/split";
import { useDebounced } from "./hooks/useDebounced";
import { SearchIcon } from "./icons";

interface Hit {
  langId: string;
  langName: string;
  meaning: string;
  form: string;
}

const MAX_HITS = 30;

export function GlobalSearch({
  onJumpToLexicon,
}: {
  onJumpToLexicon: () => void;
}) {
  const state = useSimStore((s) => s.state);
  const selectLanguage = useSimStore((s) => s.selectLanguage);
  const selectMeaning = useSimStore((s) => s.selectMeaning);
  const setLexiconSearch = useSimStore((s) => s.setLexiconSearch);
  const script = useSimStore((s) => s.displayScript);
  const openTick = useSimStore((s) => s.globalSearchOpenTick);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const debounced = useDebounced(query, 120);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // External request to open + focus (e.g. ⌘/Ctrl-K).
  useEffect(() => {
    if (openTick === 0) return;
    setOpen(true);
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [openTick]);

  const hits = useMemo<Hit[]>(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];
    const out: Hit[] = [];
    const leaves = leafIds(state.tree);
    for (const lid of leaves) {
      const node = state.tree[lid]!;
      if (node.language.extinct) continue;
      const lex = node.language.lexicon;
      for (const m of Object.keys(lex)) {
        const form = lex[m]!;
        // Always check IPA for matching (so a user typing IPA finds it),
        // but display the form via the active script (so romanized users
        // see romanized hits).
        const ipa = formToString(form).toLowerCase();
        if (m.toLowerCase().includes(q) || ipa.includes(q)) {
          out.push({
            langId: lid,
            langName: node.language.name,
            meaning: m,
            form: formatForm(form, node.language, script, m),
          });
          if (out.length >= MAX_HITS) return out;
        }
      }
    }
    return out;
  }, [debounced, state, script]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    setFocusIndex(0);
  }, [debounced]);

  const jump = (hit: Hit) => {
    selectLanguage(hit.langId);
    selectMeaning(hit.meaning);
    setLexiconSearch(hit.meaning);
    onJumpToLexicon();
    setOpen(false);
    setQuery("");
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusIndex((i) => Math.min(hits.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusIndex((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && hits[focusIndex]) {
      e.preventDefault();
      jump(hits[focusIndex]!);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="global-search">
      <span className="global-search-icon" aria-hidden>
        <SearchIcon size={14} />
      </span>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search meaning or IPA…"
        aria-label="Global search"
      />
      {open && debounced.trim().length >= 2 && (
        <div className="global-search-results" role="listbox">
          {hits.length === 0 ? (
            <div className="global-search-empty">No matches.</div>
          ) : (
            hits.map((h, i) => (
              <button
                key={`${h.langId}|${h.meaning}`}
                role="option"
                aria-selected={i === focusIndex}
                className={`global-search-hit ${i === focusIndex ? "focused" : ""}`}
                onMouseEnter={() => setFocusIndex(i)}
                onClick={() => jump(h)}
              >
                <span className="global-search-meaning">{h.meaning}</span>
                <span className="global-search-form">{h.form}</span>
                <span className="global-search-lang">{h.langName}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
