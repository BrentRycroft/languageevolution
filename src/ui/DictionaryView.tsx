import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { posOf } from "../engine/lexicon/pos";
import { CONCEPTS, tierOf, TIER_LABELS } from "../engine/lexicon/concepts";
import { formatForm } from "../engine/phonology/display";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";
import type { Language } from "../engine/types";

export function DictionaryView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const script = useSimStore((s) => s.displayScript);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"meaning" | "pos" | "tier">("meaning");

  const lang: Language | null = (() => {
    const id = selectedLangId ?? state.rootId;
    return state.tree[id]?.language ?? null;
  })();

  const rows = useMemo(() => {
    if (!lang) return [];
    const meanings = Object.keys(lang.lexicon);
    const filtered = search
      ? meanings.filter((m) => m.toLowerCase().includes(search.toLowerCase()))
      : meanings;
    const data = filtered.map((m) => {
      const origin = lang.wordOrigin?.[m];
      const isLoan = origin?.startsWith("borrow:");
      return {
        meaning: m,
        form: formatForm(lang.lexicon[m]!, lang, script),
        pos: posOf(m),
        cluster: CONCEPTS[m]?.cluster ?? "—",
        tier: tierOf(m),
        origin,
        isLoan,
      };
    });
    if (sortBy === "meaning") data.sort((a, b) => a.meaning.localeCompare(b.meaning));
    else if (sortBy === "pos") data.sort((a, b) => a.pos.localeCompare(b.pos) || a.meaning.localeCompare(b.meaning));
    else if (sortBy === "tier") data.sort((a, b) => a.tier - b.tier || a.meaning.localeCompare(b.meaning));
    return data;
  }, [lang, search, sortBy, script]);

  if (!lang) {
    return <div className="section-empty">No language selected.</div>;
  }

  return (
    <div className="col-12">
      <DictionaryHeader lang={lang} entryCount={Object.keys(lang.lexicon).length} />
      <GrammarCard lang={lang} />

      <div className="row-8 items-center flex-wrap" style={{ marginTop: 12 }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter meanings…"
          aria-label="Filter dictionary"
          style={{ flex: 1, minWidth: 160 }}
        />
        <label className="row-4 items-center label-line">
          sort by
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} aria-label="Sort dictionary">
            <option value="meaning">meaning</option>
            <option value="pos">part of speech</option>
            <option value="tier">tier</option>
          </select>
        </label>
        <span className="t-muted fs-1">
          {rows.length} of {Object.keys(lang.lexicon).length} entries
        </span>
      </div>

      <div style={{ marginTop: 8, maxHeight: 600, overflowY: "auto" }}>
        <table
          className="lexicon-table"
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "var(--fs-2)",
          }}
        >
          <thead>
            <tr>
              <th className="text-left">meaning</th>
              <th className="text-left">form</th>
              <th className="text-left">pos</th>
              <th className="text-left">cluster</th>
              <th className="text-left">tier</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.meaning}>
                <td>
                  {r.meaning}
                  {r.isLoan && (
                    <span
                      className="t-accent"
                      style={{ marginLeft: 4, fontSize: "0.85em" }}
                      title={`Borrowed from ${r.origin?.slice(7)}`}
                    >
                      ⟶
                    </span>
                  )}
                </td>
                <td className="mono">{r.form}</td>
                <td className="t-muted">{r.pos}</td>
                <td className="t-muted">{r.cluster}</td>
                <td className="t-muted">{TIER_LABELS[r.tier]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="section-empty">No entries match this filter.</div>
        )}
      </div>
    </div>
  );
}

function DictionaryHeader({ lang, entryCount }: { lang: Language; entryCount: number }) {
  const yearsPerGen = useSimStore(
    (s) => s.config.yearsPerGeneration ?? YEARS_PER_GENERATION,
  );
  const currentGen = useSimStore((s) => s.state.generation);
  const ageGens = currentGen - lang.birthGeneration;
  return (
    <div className="row-8 items-center">
      <h3 style={{ margin: 0 }}>{lang.name}</h3>
      <span
        className="label-line"
        title={`Born at gen ${lang.birthGeneration} (${formatElapsed(lang.birthGeneration, yearsPerGen)} into the simulation). Current age: ${formatElapsed(ageGens, yearsPerGen)}.`}
      >
        {entryCount} entries · age {formatElapsed(ageGens, yearsPerGen)}
        {lang.extinct && <> · <span className="t-danger">extinct</span></>}
      </span>
    </div>
  );
}

function GrammarCard({ lang }: { lang: Language }) {
  const g = lang.grammar;
  const rows: Array<[string, string]> = [
    ["word order", g.wordOrder],
    ["affix position", g.affixPosition],
    ["plural marking", g.pluralMarking],
    ["tense marking", g.tenseMarking],
    ["case", g.hasCase ? `yes (${g.caseStrategy ?? "case"})` : "no"],
    ["article system", g.articlePresence ?? "none"],
    ["adjective position", g.adjectivePosition ?? "pre"],
    ["possessor position", g.possessorPosition ?? "pre"],
    ["numeral position", g.numeralPosition ?? "pre"],
    ["negation", g.negationPosition ?? "pre-verb"],
    ["aspect", g.aspectMarking ?? "none"],
    ["mood", g.moodMarking ?? "declarative"],
    ["voice", g.voice ?? "active"],
    ["interrogative", g.interrogativeStrategy ?? "intonation"],
    ["pro-drop", g.prodrop ? "yes" : "no"],
    ["incorporates", g.incorporates ? "yes" : "no"],
    ["classifiers", g.classifierSystem ? "yes" : "no"],
    ["synthesis", String(g.synthesisIndex ?? 2.0)],
    ["fusion", String(g.fusionIndex ?? 0.5)],
    ["gender count", String(g.genderCount)],
  ];
  return (
    <details
      open
      style={{
        marginTop: 8,
        padding: "8px 12px",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-2)",
        background: "var(--panel-2)",
      }}
    >
      <summary className="label-line" style={{ cursor: "pointer" }}>
        grammar profile
      </summary>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "2px 16px",
          marginTop: 8,
        }}
      >
        {rows.map(([k, v]) => (
          <div key={k} className="row-4 items-center fs-1">
            <span className="t-muted" style={{ minWidth: 110 }}>{k}</span>
            <span className="t-text mono">{v}</span>
          </div>
        ))}
      </div>
    </details>
  );
}
