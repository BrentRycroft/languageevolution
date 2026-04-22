import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { formToString, levenshtein } from "../engine/phonology/ipa";
import type { Language, LanguageEvent } from "../engine/types";

/**
 * Swadesh-style lexicostatistic similarity: for every shared meaning, count
 * as "cognate" when the Levenshtein edit distance is ≤ 40% of the longer
 * form. Returns a percentage 0–100 plus counts.
 */
function lexicalSimilarity(
  a: Language,
  b: Language,
): { pct: number; shared: number; cognate: number } {
  const shared = Object.keys(a.lexicon).filter((m) => b.lexicon[m]);
  if (shared.length === 0) return { pct: 0, shared: 0, cognate: 0 };
  let cognate = 0;
  for (const m of shared) {
    const fa = a.lexicon[m]!;
    const fb = b.lexicon[m]!;
    const d = levenshtein(fa, fb);
    const longer = Math.max(fa.length, fb.length);
    if (longer === 0) continue;
    if (d / longer <= 0.4) cognate++;
  }
  return { pct: Math.round((cognate / shared.length) * 100), shared: shared.length, cognate };
}

/**
 * Two-column side-by-side comparison using the user's "compare" selection.
 * Shows lexicon, grammar features, morphology paradigms, and recent events
 * for the first two checked languages (or the selected + its sibling if no
 * compare selection yet).
 */
export function CompareView() {
  const state = useSimStore((s) => s.state);
  const compareIds = useSimStore((s) => s.compareLangIds);
  const selectedLangId = useSimStore((s) => s.selectedLangId);

  const pair = useMemo<string[]>(() => {
    if (compareIds.length >= 2) return compareIds.slice(0, 2);
    // Fallbacks: selected + nearest alive sibling, else first two alive leaves.
    const alive = leafIds(state.tree).filter(
      (id) => !state.tree[id]!.language.extinct,
    );
    if (compareIds.length === 1) {
      const other = alive.find((id) => id !== compareIds[0]);
      return other ? [compareIds[0]!, other] : compareIds.slice();
    }
    if (selectedLangId && alive.includes(selectedLangId)) {
      const other = alive.find((id) => id !== selectedLangId);
      return other ? [selectedLangId, other] : [selectedLangId];
    }
    return alive.slice(0, 2);
  }, [compareIds, selectedLangId, state.tree]);

  if (pair.length < 2) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)", padding: 12 }}>
        Check two or more languages in the Lexicon → Compare chip to populate
        this view, or select one in the Tree and we'll auto-pair it with a
        sibling.
      </div>
    );
  }

  const [a, b] = pair;
  const langA = state.tree[a!]!.language;
  const langB = state.tree[b!]!.language;
  const sim = lexicalSimilarity(langA, langB);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "6px 10px",
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2)",
          fontSize: "var(--fs-1)",
          color: "var(--muted)",
        }}
      >
        <strong style={{ color: "var(--text)", fontSize: "var(--fs-2)" }}>
          Lexical similarity
        </strong>
        <span style={{ fontFamily: "var(--font-mono)", color: "var(--accent)" }}>
          {sim.pct}%
        </span>
        <span>
          {sim.cognate}/{sim.shared} shared meanings classify as cognate (edit-dist ≤ 40% of longer form)
        </span>
      </div>
      <div className="compare-grid" style={{ flex: 1, minHeight: 0 }}>
        <CompareColumn lang={langA} otherLang={langB} />
        <CompareColumn lang={langB} otherLang={langA} />
      </div>
    </div>
  );
}

function CompareColumn({ lang, otherLang }: { lang: Language; otherLang: Language }) {
  const meanings = useMemo(
    () => Array.from(new Set([...Object.keys(lang.lexicon), ...Object.keys(otherLang.lexicon)])).sort(),
    [lang, otherLang],
  );

  return (
    <div className="compare-col">
      <div className="compare-col-head">
        <div style={{ fontWeight: "var(--fw-semi)", fontSize: "var(--fs-3)" }}>
          {lang.name}
          {lang.extinct && (
            <span className="lexicon-extinct-mark" style={{ marginLeft: 6 }}>×</span>
          )}
        </div>
        <div style={{ fontSize: "var(--fs-1)", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
          {Object.keys(lang.lexicon).length} words · conservatism {lang.conservatism.toFixed(2)} ·{" "}
          {lang.phonemeInventory.segmental.length} segments
          {lang.phonemeInventory.usesTones ? " + tones" : ""}
        </div>
      </div>

      <Section title="Grammar">
        <GrammarRows lang={lang} other={otherLang} />
      </Section>

      <Section title="Lexicon">
        <div className="compare-lex">
          {meanings.slice(0, 80).map((m) => {
            const f = lang.lexicon[m];
            const fOther = otherLang.lexicon[m];
            const divergent =
              f && fOther ? levenshtein(f, fOther) > 0 : f !== fOther;
            return (
              <div
                key={m}
                className={`compare-lex-row ${divergent ? "divergent" : ""}`}
              >
                <span className="compare-lex-meaning">{m}</span>
                <span className="compare-lex-form">
                  {f ? formToString(f) : <span style={{ color: "var(--muted-2)" }}>—</span>}
                </span>
              </div>
            );
          })}
          {meanings.length > 80 && (
            <div style={{ fontSize: "var(--fs-1)", color: "var(--muted)", padding: "4px 6px" }}>
              showing first 80 of {meanings.length} meanings
            </div>
          )}
        </div>
      </Section>

      <Section title="Recent events">
        <EventList events={lang.events} />
      </Section>
    </div>
  );
}

function GrammarRows({ lang, other }: { lang: Language; other: Language }) {
  const rows: Array<[string, string, string]> = [
    ["order", lang.grammar.wordOrder, other.grammar.wordOrder],
    ["affix", lang.grammar.affixPosition, other.grammar.affixPosition],
    ["plural", lang.grammar.pluralMarking, other.grammar.pluralMarking],
    ["tense", lang.grammar.tenseMarking, other.grammar.tenseMarking],
    ["case", lang.grammar.hasCase ? "yes" : "no", other.grammar.hasCase ? "yes" : "no"],
    [
      "gender",
      String(lang.grammar.genderCount),
      String(other.grammar.genderCount),
    ],
  ];
  return (
    <table style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "var(--fs-1)" }}>
      <tbody>
        {rows.map(([k, v, v2]) => (
          <tr key={k} className={v !== v2 ? "grammar-diff" : ""}>
            <td style={{ color: "var(--muted)", padding: "2px 6px" }}>{k}</td>
            <td style={{ padding: "2px 6px" }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EventList({ events }: { events: LanguageEvent[] }) {
  const recent = events.slice(-8).reverse();
  if (recent.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-1)", padding: "2px 6px" }}>
        No events yet.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {recent.map((e, i) => (
        <div
          key={i}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-1)",
            display: "grid",
            gridTemplateColumns: "42px 1fr",
            gap: 6,
            padding: "2px 4px",
          }}
        >
          <span style={{ color: "var(--muted)" }}>g{e.generation}</span>
          <span>{e.description}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="compare-section">
      <div className="grammar-section-label" style={{ marginBottom: 4 }}>
        {title}
      </div>
      {children}
    </div>
  );
}
