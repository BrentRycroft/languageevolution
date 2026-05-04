import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import type { LanguageEvent } from "../engine/types";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";
import { CopyButton } from "./CopyButton";
import { downloadAs, toCsv, slugForFile } from "./exportUtils";
import { ListSearch } from "./ListSearch";

const KIND_COLOR: Record<LanguageEvent["kind"], string> = {
  sound_change: "var(--accent)",
  coinage: "var(--accent-2)",
  grammar_shift: "var(--change)",
  semantic_drift: "#c88dff",
  borrow: "#ffb473",
  grammaticalize: "#7be0b5",
  chain_shift: "#ff8fd4",
  taboo: "#ff6363",
  actuation: "#9bdcff",
  // Phase 29 Tranche 3a: new kinds previously squashed under the above.
  volatility: "#ff8fa3",
  areal: "#a0d8ff",
  creolization: "#ffd166",
  lexical_replacement: "#bb86fc",
  productivity: "#80ffd4",
  suppletion: "#ffb3c1",
  merger: "#ffaaaa",
  tier_transition: "#ffd07a",
  kinship_simplification: "#d6c1ff",
};

const KIND_LABEL: Record<LanguageEvent["kind"], string> = {
  sound_change: "sound",
  coinage: "coin",
  grammar_shift: "grammar",
  semantic_drift: "meaning",
  borrow: "borrow",
  grammaticalize: "gram",
  chain_shift: "chain",
  taboo: "taboo",
  actuation: "actuate",
  volatility: "volatility",
  areal: "areal",
  creolization: "creole",
  lexical_replacement: "replace",
  productivity: "productive",
  suppletion: "supp",
  merger: "merger",
  tier_transition: "tier",
  kinship_simplification: "kinship",
};

export function EventsLog() {
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selected = useSimStore((s) =>
    selectedLangId ? s.state.tree[selectedLangId]?.language : undefined,
  );
  const yearsPerGen = useSimStore(
    (s) => s.config.yearsPerGeneration ?? YEARS_PER_GENERATION,
  );

  const allEvents = useMemo(
    () => (selected ? selected.events.slice().reverse() : []),
    [selected?.events, selected],
  );
  const [filter, setFilter] = useState("");
  // Phase 29 Tranche 4g: per-kind toggle chips. When the set is
  // non-empty, only events whose kind is in the set are shown. When
  // empty, all kinds are shown (the default).
  const [enabledKinds, setEnabledKinds] = useState<
    ReadonlySet<LanguageEvent["kind"]>
  >(new Set());
  const toggleKind = (k: LanguageEvent["kind"]) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const kindCounts = useMemo(() => {
    const out: Partial<Record<LanguageEvent["kind"], number>> = {};
    for (const e of allEvents) {
      out[e.kind] = (out[e.kind] ?? 0) + 1;
    }
    return out;
  }, [allEvents]);

  const events = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let out = allEvents;
    if (enabledKinds.size > 0) {
      out = out.filter((e) => enabledKinds.has(e.kind));
    }
    if (!q) return out;
    return out.filter(
      (e) =>
        KIND_LABEL[e.kind].toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        `g${e.generation}`.includes(q),
    );
  }, [allEvents, filter, enabledKinds]);

  if (!selected) {
    return (
      <div style={{ color: "var(--muted)", fontSize: 12 }}>
        Select a language to see its history.
      </div>
    );
  }

  const copyText = () =>
    events
      .map(
        (e) =>
          `g${e.generation}\t${KIND_LABEL[e.kind]}\t${e.description}`,
      )
      .join("\n");

  const onExportCsv = () => {
    const rows = events.map((e) => [e.generation, KIND_LABEL[e.kind], e.description]);
    const csv = toCsv(["generation", "kind", "description"], rows);
    downloadAs(`events-${slugForFile(selected.name)}-g${selected.events.at(-1)?.generation ?? 0}.csv`, csv, "text/csv;charset=utf-8");
  };

  return (
    <div style={{ fontSize: 12 }}>
      <div
        style={{
          marginBottom: 6,
          color: "var(--muted)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        <span>
          {selected.name} ·{" "}
          {filter.trim() ? `${events.length}/${allEvents.length}` : events.length}{" "}
          events
        </span>
        {allEvents.length > 0 && (
          <ListSearch
            value={filter}
            onChange={setFilter}
            placeholder="Filter events…"
            label="Filter events by kind, description, or generation"
            style={{ flex: 1, minWidth: 160 }}
          />
        )}
        {events.length > 0 && (
          <>
            <CopyButton text={copyText} title="Copy events as TSV" />
            <button
              type="button"
              className="ghost"
              onClick={onExportCsv}
              title="Download events as CSV"
              aria-label="Download events as CSV"
              style={{ fontSize: 11, padding: "2px 8px" }}
            >
              CSV
            </button>
          </>
        )}
      </div>
      {Object.keys(kindCounts).length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 4,
            marginBottom: 6,
          }}
          role="group"
          aria-label="Filter by event kind"
        >
          {(Object.keys(kindCounts) as LanguageEvent["kind"][])
            .sort((a, b) => (kindCounts[b] ?? 0) - (kindCounts[a] ?? 0))
            .map((k) => {
              const active = enabledKinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  aria-pressed={active}
                  title={`${KIND_LABEL[k]}: ${kindCounts[k]} event${kindCounts[k] === 1 ? "" : "s"}`}
                  style={{
                    fontSize: 10,
                    padding: "2px 6px",
                    borderRadius: 999,
                    border: `1px solid ${active ? KIND_COLOR[k] : "var(--border)"}`,
                    background: active ? KIND_COLOR[k] : "transparent",
                    color: active ? "var(--bg)" : KIND_COLOR[k],
                    cursor: "pointer",
                  }}
                >
                  {KIND_LABEL[k]} {kindCounts[k]}
                </button>
              );
            })}
          {enabledKinds.size > 0 && (
            <button
              type="button"
              onClick={() => setEnabledKinds(new Set())}
              title="Show all kinds"
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--muted)",
                cursor: "pointer",
              }}
            >
              clear
            </button>
          )}
        </div>
      )}
      {events.length === 0 && (
        <div className="t-muted">
          No events yet — run the simulation to see this language's history.
        </div>
      )}
      <div className="col-2">
        {events.map((e, i) => (
          <div
            key={`${e.generation}-${e.kind}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "40px 60px 1fr",
              gap: 6,
              padding: "3px 4px",
              borderBottom: "1px solid var(--border)",
              fontFamily: "'SF Mono', Menlo, monospace",
              fontSize: 11,
            }}
          >
            <span
              className="t-muted"
              title={`Generation ${e.generation} · ${formatElapsed(e.generation, yearsPerGen)} into the simulation`}
            >
              g{e.generation} · {formatElapsed(e.generation, yearsPerGen)}
            </span>
            <span style={{ color: KIND_COLOR[e.kind] }}>{KIND_LABEL[e.kind]}</span>
            <span>{e.description}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
