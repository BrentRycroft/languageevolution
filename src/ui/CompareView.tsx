import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { levenshtein } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import type { Language, LanguageEvent, LanguageTree } from "../engine/types";
import { diffActiveRules, diffOtRankings } from "../engine/analysis/ruleDiff";
import { ScriptPicker } from "./ScriptPicker";
import { CopyButton } from "./CopyButton";
import { downloadAs, slugForFile } from "./exportUtils";
import {
  generateNarrative,
  randomNarrativeSeed,
  type NarrativeLine,
} from "../engine/narrative/generate";
import { generateDiscourseNarrative } from "../engine/narrative/discourse_generate";
import type { DiscourseGenre } from "../engine/narrative/discourse";
import { traceEtymology } from "../engine/translator/cognates";

type CompareMode = "lexicon" | "narrative" | "cognate";

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

export function CompareView() {
  const state = useSimStore((s) => s.state);
  const compareIds = useSimStore((s) => s.compareLangIds);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectedMeaning = useSimStore((s) => s.selectedMeaning);

  const [mode, setMode] = useState<CompareMode>("lexicon");

  const pair = useMemo<string[]>(() => {
    if (compareIds.length >= 2) return compareIds.slice(0, 2);
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 0",
        }}
        role="tablist"
        aria-label="Compare mode"
      >
        {(["lexicon", "narrative", "cognate"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`chip ${mode === m ? "active" : ""}`}
            onClick={() => setMode(m)}
          >
            {modeLabel(m)}
          </button>
        ))}
        <span className="ml-auto">
          <ScriptPicker />
        </span>
      </div>

      {pair.length < 2 && mode !== "cognate" ? (
        <div className="section-empty">
          Check two or more languages in the Lexicon → Compare chip to populate
          this view, or select one in the Tree and we'll auto-pair it with a
          sibling.
        </div>
      ) : mode === "lexicon" ? (
        <LexiconCompare langA={state.tree[pair[0]!]!.language} langB={state.tree[pair[1]!]!.language} />
      ) : mode === "narrative" ? (
        <NarrativeCompare
          defaultLangAId={pair[0]!}
          defaultLangBId={pair[1]!}
        />
      ) : (
        <CognateTrace
          tree={state.tree}
          leafIds={pair}
          meaning={selectedMeaning ?? "water"}
        />
      )}
    </div>
  );
}

function modeLabel(m: CompareMode): string {
  switch (m) {
    case "lexicon": return "Lexicon";
    case "narrative": return "Narrative";
    case "cognate": return "Cognate trace";
  }
}

function LexiconCompare({ langA, langB }: { langA: Language; langB: Language }) {
  const sim = lexicalSimilarity(langA, langB);
  return (
    <>
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
          {sim.cognate}/{sim.shared} shared meanings classify as cognate (edit-dist ≤ 40 % of longer form)
        </span>
      </div>
      <RuleDiffBanner a={langA} b={langB} />
      <div className="compare-grid" style={{ flex: 1, minHeight: 0 }}>
        <CompareColumn lang={langA} otherLang={langB} />
        <CompareColumn lang={langB} otherLang={langA} />
      </div>
    </>
  );
}

function RuleDiffBanner({ a, b }: { a: Language; b: Language }) {
  const rule = diffActiveRules(a, b);
  const ot = diffOtRankings(a, b).filter(
    (r) => (r.aRank ?? 0) !== (r.bRank ?? 0),
  );
  if (
    rule.onlyInA.length === 0 &&
    rule.onlyInB.length === 0 &&
    rule.both.length === 0 &&
    ot.length === 0
  ) {
    return null;
  }
  return (
    <details className="compare-diff" open>
      <summary>
        Rule + OT diff ({rule.both.length} shared, {rule.onlyInA.length + rule.onlyInB.length} unique)
      </summary>
      <div className="compare-diff-body">
        <div className="compare-diff-col">
          <h6>Only in {a.name}</h6>
          {rule.onlyInA.length === 0 ? (
            <div className="muted">—</div>
          ) : (
            rule.onlyInA.map((r) => (
              <div key={r.id} className="rule-chip" title={r.description}>
                <span className="fam">{r.family}</span>
                <span>{r.templateId.split(".").slice(-1)[0]}</span>
              </div>
            ))
          )}
        </div>
        <div className="compare-diff-col">
          <h6>Only in {b.name}</h6>
          {rule.onlyInB.length === 0 ? (
            <div className="muted">—</div>
          ) : (
            rule.onlyInB.map((r) => (
              <div key={r.id} className="rule-chip" title={r.description}>
                <span className="fam">{r.family}</span>
                <span>{r.templateId.split(".").slice(-1)[0]}</span>
              </div>
            ))
          )}
        </div>
        <div className="compare-diff-col">
          <h6>Shared templates</h6>
          {rule.both.length === 0 ? (
            <div className="muted">—</div>
          ) : (
            rule.both.map((pair) => (
              <div key={pair.template} className="rule-chip shared">
                <span>{pair.template.split(".").slice(-1)[0]}</span>
                <span className="muted">
                  s={pair.a.strength.toFixed(2)}/{pair.b.strength.toFixed(2)}
                </span>
              </div>
            ))
          )}
        </div>
        {ot.length > 0 && (
          <div className="compare-diff-col" style={{ gridColumn: "1 / -1" }}>
            <h6>OT ranking diff (top 6)</h6>
            <table className="compare-ot">
              <thead>
                <tr>
                  <th>constraint</th>
                  <th>{a.name}</th>
                  <th>{b.name}</th>
                </tr>
              </thead>
              <tbody>
                {ot.slice(0, 6).map((row) => (
                  <tr key={row.constraint}>
                    <td>{row.constraint}</td>
                    <td className="num">{row.aRank ?? "—"}</td>
                    <td className="num">{row.bRank ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </details>
  );
}

function CompareColumn({ lang, otherLang }: { lang: Language; otherLang: Language }) {
  const script = useSimStore((s) => s.displayScript);
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

      <Section title="Paradigms">
        <ParadigmDiff lang={lang} other={otherLang} />
      </Section>

      <Section title="Phoneme inventory">
        <InventoryDiff lang={lang} other={otherLang} />
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
                  {f ? formatForm(f, lang, script) : <span style={{ color: "var(--muted-2)" }}>—</span>}
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
  const stressOf = (l: Language) => l.stressPattern ?? "penult";
  const fmt = (v: unknown): string => {
    if (v === undefined || v === null) return "—";
    if (typeof v === "boolean") return v ? "yes" : "no";
    return String(v);
  };
  const rows: Array<[string, unknown, unknown]> = [
    ["order", lang.grammar.wordOrder, other.grammar.wordOrder],
    ["affix", lang.grammar.affixPosition, other.grammar.affixPosition],
    ["plural", lang.grammar.pluralMarking, other.grammar.pluralMarking],
    ["tense", lang.grammar.tenseMarking, other.grammar.tenseMarking],
    ["case", lang.grammar.hasCase, other.grammar.hasCase],
    ["case strategy", lang.grammar.caseStrategy, other.grammar.caseStrategy],
    ["alignment", lang.grammar.alignment, other.grammar.alignment],
    ["gender", lang.grammar.genderCount, other.grammar.genderCount],
    ["article", lang.grammar.articlePresence, other.grammar.articlePresence],
    ["adjective", lang.grammar.adjectivePosition, other.grammar.adjectivePosition],
    ["possessor", lang.grammar.possessorPosition, other.grammar.possessorPosition],
    ["numeral", lang.grammar.numeralPosition, other.grammar.numeralPosition],
    ["negation", lang.grammar.negationPosition, other.grammar.negationPosition],
    ["aspect", lang.grammar.aspectMarking, other.grammar.aspectMarking],
    ["voice", lang.grammar.voice, other.grammar.voice],
    ["mood", lang.grammar.moodMarking, other.grammar.moodMarking],
    ["interrogative", lang.grammar.interrogativeStrategy, other.grammar.interrogativeStrategy],
    ["pro-drop", lang.grammar.prodrop, other.grammar.prodrop],
    ["harmony", lang.grammar.harmony, other.grammar.harmony],
    ["evidential", lang.grammar.evidentialMarking, other.grammar.evidentialMarking],
    ["classifiers", lang.grammar.classifierSystem, other.grammar.classifierSystem],
    ["relative cl.", lang.grammar.relativeClauseStrategy, other.grammar.relativeClauseStrategy],
    ["serial verbs", lang.grammar.serialVerbConstructions, other.grammar.serialVerbConstructions],
    ["politeness", lang.grammar.politenessRegister, other.grammar.politenessRegister],
    ["morph type", lang.grammar.morphologicalType, other.grammar.morphologicalType],
    ["synthesis idx", lang.grammar.synthesisIndex?.toFixed?.(2), other.grammar.synthesisIndex?.toFixed?.(2)],
    ["fusion idx", lang.grammar.fusionIndex?.toFixed?.(2), other.grammar.fusionIndex?.toFixed?.(2)],
    ["stress", stressOf(lang), stressOf(other)],
  ];
  return (
    <table style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "var(--fs-1)" }}>
      <tbody>
        {rows.map(([k, v, v2]) => {
          const fa = fmt(v);
          const fb = fmt(v2);
          const diff = fa !== fb;
          // Only show rows that have at least one non-"—" value, to keep
          // the table tight when both languages haven't initialised the
          // optional feature.
          if (fa === "—" && fb === "—") return null;
          return (
            <tr key={k} className={diff ? "grammar-diff" : ""}>
              <td style={{ color: "var(--muted)", padding: "2px 6px" }}>{k}</td>
              <td style={{ padding: "2px 6px" }}>{fa}</td>
              <td
                style={{
                  padding: "2px 6px",
                  color: diff ? "var(--accent-2)" : "var(--text)",
                }}
              >
                {fb}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ParadigmDiff({ lang, other }: { lang: Language; other: Language }) {
  const allCats = new Set<string>();
  for (const c of Object.keys(lang.morphology.paradigms)) allCats.add(c);
  for (const c of Object.keys(other.morphology.paradigms)) allCats.add(c);
  const cats = Array.from(allCats).sort();
  if (cats.length === 0) {
    return (
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-1)", padding: "2px 6px" }}>
        No paradigms in either language.
      </div>
    );
  }
  const fmtAffix = (l: Language, c: string): string => {
    const p = l.morphology.paradigms[c as keyof typeof l.morphology.paradigms];
    if (!p) return "—";
    return `/${p.affix.join("")}/ (${p.position})`;
  };
  return (
    <table style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: "var(--fs-1)" }}>
      <tbody>
        {cats.map((c) => {
          const a = fmtAffix(lang, c);
          const b = fmtAffix(other, c);
          const diff = a !== b;
          return (
            <tr key={c} className={diff ? "grammar-diff" : ""}>
              <td style={{ color: "var(--muted)", padding: "2px 6px" }}>{c}</td>
              <td style={{ padding: "2px 6px" }}>{a}</td>
              <td
                style={{
                  padding: "2px 6px",
                  color: diff ? "var(--accent-2)" : "var(--text)",
                }}
              >
                {b}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function InventoryDiff({ lang, other }: { lang: Language; other: Language }) {
  const a = new Set(lang.phonemeInventory.segmental);
  const b = new Set(other.phonemeInventory.segmental);
  const all = Array.from(new Set([...a, ...b])).sort();
  const onlyA: string[] = [];
  const onlyB: string[] = [];
  const both: string[] = [];
  for (const p of all) {
    if (a.has(p) && b.has(p)) both.push(p);
    else if (a.has(p)) onlyA.push(p);
    else onlyB.push(p);
  }
  const Pill = ({ label, items, color }: { label: string; items: string[]; color: string }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="t-muted" style={{ fontSize: 11 }}>
        {label} ({items.length})
      </span>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color,
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
        }}
      >
        {items.length === 0 ? <span className="t-muted">—</span> : items.join(" ")}
      </div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <Pill label={`only in ${lang.name}`} items={onlyA} color="var(--accent)" />
      <Pill label="shared" items={both} color="var(--text)" />
      <Pill label={`only in ${other.name}`} items={onlyB} color="var(--accent-2)" />
    </div>
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
    <div className="col-2">
      {recent.map((e, i) => (
        <div
          key={`${e.generation}-${e.kind}-${i}`}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--fs-1)",
            display: "grid",
            gridTemplateColumns: "42px 1fr",
            gap: 6,
            padding: "2px 4px",
          }}
        >
          <span className="t-muted">g{e.generation}</span>
          <span>{e.description}</span>
        </div>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="compare-section">
      <div className="grammar-section-label mb-4">
        {title}
      </div>
      {children}
    </div>
  );
}

function NarrativeCompare({
  defaultLangAId,
  defaultLangBId,
}: {
  defaultLangAId: string;
  defaultLangBId: string;
}) {
  const tree = useSimStore((s) => s.state.tree);
  const script = useSimStore((s) => s.displayScript);
  const generation = useSimStore((s) => s.state.generation);
  const [seed, setSeed] = useState<string>(() => randomNarrativeSeed());
  const [lineCount, setLineCount] = useState(6);
  const [genre, setGenre] = useState<"skeleton" | DiscourseGenre>("myth");
  const [langAId, setLangAId] = useState(defaultLangAId);
  const [langBId, setLangBId] = useState(defaultLangBId);

  const aliveLeaves = useMemo(
    () => leafIds(tree).filter((id) => !tree[id]!.language.extinct),
    [tree],
  );
  const langA = tree[langAId]?.language ?? tree[defaultLangAId]!.language;
  const langB = tree[langBId]?.language ?? tree[defaultLangBId]!.language;

  const linesA = useMemo(
    () =>
      genre === "skeleton"
        ? generateNarrative(langA, seed, lineCount, script)
        : discourseToNarrativeLines(
            langA,
            seed,
            lineCount,
            genre,
            script,
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [langA, seed, lineCount, script, generation, genre],
  );
  const linesB = useMemo(
    () =>
      genre === "skeleton"
        ? generateNarrative(langB, seed, lineCount, script)
        : discourseToNarrativeLines(
            langB,
            seed,
            lineCount,
            genre,
            script,
          ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [langB, seed, lineCount, script, generation, genre],
  );

  return (
    <div className="col-8">
      <div className="row-8 items-center flex-wrap">
        <select
          value={langAId}
          onChange={(e) => setLangAId(e.target.value)}
          aria-label="Language A"
          title="Left-column language"
        >
          {aliveLeaves.map((id) => (
            <option key={id} value={id}>
              {tree[id]!.language.name}
            </option>
          ))}
        </select>
        <span className="t-muted">vs</span>
        <select
          value={langBId}
          onChange={(e) => setLangBId(e.target.value)}
          aria-label="Language B"
          title="Right-column language"
        >
          {aliveLeaves.map((id) => (
            <option key={id} value={id}>
              {tree[id]!.language.name}
            </option>
          ))}
        </select>
        <button
          className="primary"
          onClick={() => setSeed(randomNarrativeSeed())}
          title="Generate a new randomly-seeded story"
        >
          🎲 New story
        </button>
        <select
          value={genre}
          onChange={(e) => setGenre(e.target.value as "skeleton" | DiscourseGenre)}
          aria-label="Narrative genre"
          title="Genre — skeleton mode keeps the legacy template comparison; named genres use discourse-coherent generation with pronoun reference"
        >
          <option value="skeleton">skeleton (compare)</option>
          <option value="myth">myth</option>
          <option value="legend">legend</option>
          <option value="daily">daily life</option>
          <option value="dialogue">dialogue</option>
        </select>
        <select
          value={lineCount}
          onChange={(e) => setLineCount(parseInt(e.target.value, 10))}
          aria-label="Number of lines"
        >
          {[3, 5, 6, 8, 10].map((n) => (
            <option key={n} value={n}>{n} lines</option>
          ))}
        </select>
        <span className="label-line" style={{ marginLeft: 4 }}>
          {genre === "skeleton"
            ? "Same skeleton in both columns — only the realised forms differ."
            : "Sentences composed natively in each language; English caption is derived from the target tokens."}
        </span>
      </div>
      <div className="row-12 flex-wrap items-start">
        <NarrativePane lang={langA} lines={linesA} />
        <NarrativePane lang={langB} lines={linesB} />
      </div>
    </div>
  );
}

function discourseToNarrativeLines(
  lang: Language,
  seed: string,
  lines: number,
  genre: DiscourseGenre,
  script: import("../engine/phonology/display").DisplayScript,
): NarrativeLine[] {
  const out = generateDiscourseNarrative(lang, seed, { lines, genre, script });
  return out.map((l) => ({ text: l.text, gloss: l.english }));
}

function NarrativePane({ lang, lines }: { lang: Language; lines: NarrativeLine[] }) {
  if (lines.length === 0) {
    return (
      <div
        style={{
          flex: 1,
          minWidth: 280,
          padding: 12,
          border: "1px solid var(--border)",
          borderRadius: "var(--r-2)",
          background: "var(--panel-2)",
          color: "var(--muted)",
        }}
      >
        Not enough vocabulary in {lang.name} to compose a sentence yet.
      </div>
    );
  }
  return (
    <div
      style={{
        flex: 1,
        minWidth: 280,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: "var(--r-2)",
        background: "var(--panel-2)",
      }}
    >
      <div
        style={{
          fontSize: "var(--fs-1)",
          color: "var(--muted)",
          fontFamily: "var(--font-mono)",
          marginBottom: 8,
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ flex: 1 }}>
          {lang.name} · word order {lang.grammar.wordOrder} · {Object.keys(lang.morphology.paradigms).length} paradigms
        </span>
        <CopyButton
          text={() =>
            lines.map((l) => `${l.text}\n${l.gloss}`).join("\n\n")
          }
          title="Copy narrative (target + English) to clipboard"
        />
        <button
          type="button"
          className="ghost"
          onClick={() => {
            const txt = lines.map((l) => `${l.text}\n${l.gloss}`).join("\n\n") + "\n";
            downloadAs(`narrative-${slugForFile(lang.name)}.txt`, txt);
          }}
          title="Download narrative as text"
          aria-label="Download narrative as text"
          style={{ fontSize: 11, padding: "2px 8px" }}
        >
          TXT
        </button>
      </div>
      {lines.map((line, i) => (
        <div key={`${line.gloss}-${i}`} className="mb-6">
          <div
            style={{
              fontFamily: "var(--font-mono)",
              color: "var(--accent)",
              fontSize: "var(--fs-3)",
            }}
          >
            {line.text}
          </div>
          <div
            style={{
              fontSize: "var(--fs-1)",
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {line.gloss}
          </div>
        </div>
      ))}
    </div>
  );
}

function CognateTrace({
  tree,
  leafIds,
  meaning,
}: {
  tree: LanguageTree;
  leafIds: string[];
  meaning: string;
}) {
  const script = useSimStore((s) => s.displayScript);
  const [meaningInput, setMeaningInput] = useState(meaning);

  return (
    <div className="col-8">
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <label className="label-line">
          Meaning:
        </label>
        <input
          type="text"
          value={meaningInput}
          onChange={(e) => setMeaningInput(e.target.value)}
          placeholder="e.g. water"
          aria-label="Meaning to trace"
        />
        <span className="label-line">
          Showing how this meaning's form changed from proto to each selected leaf.
        </span>
      </div>
      <div className="col-8">
        {leafIds.length === 0 ? (
          <div className="t-muted">
            Select languages in the Lexicon → Compare chip to populate.
          </div>
        ) : (
          leafIds.map((leafId) => {
            const lang = tree[leafId]?.language;
            if (!lang) return null;
            const steps = traceEtymology(tree, leafId, meaningInput.toLowerCase(), script);
            return (
              <div
                key={leafId}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-2)",
                  background: "var(--panel-2)",
                  padding: 10,
                }}
              >
                <div style={{ fontSize: "var(--fs-2)", fontWeight: "var(--fw-semi)", marginBottom: 6 }}>
                  {lang.name}
                </div>
                {steps.length === 0 ? (
                  <div className="label-line">
                    {lang.name} has no entry for "{meaningInput}".
                  </div>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {steps.map((s, i) => (
                      <div key={`${s.languageId}-${i}`} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div
                          style={{
                            padding: "4px 8px",
                            background: "var(--panel)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--r-1)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "var(--fs-1)",
                          }}
                        >
                          <div style={{ fontSize: 10, color: "var(--muted)" }}>
                            {s.languageName} @ g{s.generation}
                          </div>
                          <div className="t-accent">{s.form}</div>
                        </div>
                        {i < steps.length - 1 && <span className="t-muted">→</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
