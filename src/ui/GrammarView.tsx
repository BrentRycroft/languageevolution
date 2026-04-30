import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { inflect } from "../engine/morphology/evolve";
import type { MorphCategory } from "../engine/morphology/types";
import { formToString } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import { posOf } from "../engine/lexicon/pos";
import { ScriptPicker } from "./ScriptPicker";

export function GrammarView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const selectLanguage = useSimStore((s) => s.selectLanguage);

  const leaves = leafIds(state.tree);

  const selected = selectedLangId ? state.tree[selectedLangId]?.language : undefined;

  return (
    <div style={{ fontSize: 12 }}>
      {selected ? (
        <>
          <div
            style={{
              marginBottom: 8,
              fontSize: 13,
              color: selected.extinct ? "var(--muted)" : "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <strong>{selected.name}</strong>{" "}
            {selected.extinct && <span className="t-danger">(extinct)</span>}
            <span className="ml-auto">
              <ScriptPicker />
            </span>
          </div>
          <GrammarFeatureList grammar={selected.grammar} lang={selected} />
          <InventoryDisplay lang={selected} />
          <ParadigmTable lang={selected} />
        </>
      ) : (
        <div className="t-muted">Select a language to view grammar.</div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 4, flexWrap: "wrap" }}>
        {leaves.map((id) => {
          const lang = state.tree[id]!.language;
          return (
            <button
              key={id}
              onClick={() => selectLanguage(id)}
              style={{
                opacity: lang.extinct ? 0.5 : 1,
                background: id === selectedLangId ? "var(--accent)" : undefined,
                color: id === selectedLangId ? "#0a1520" : undefined,
              }}
            >
              {lang.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function InventoryDisplay({ lang }: { lang: import("../engine/types").Language }) {
  const { segmental, tones, usesTones } = lang.phonemeInventory;
  if (segmental.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="grammar-section-label">
        Phoneme inventory
        <span className="grammar-section-meta">{segmental.length} segments{usesTones ? `, ${tones.length} tones` : ""}</span>
      </div>
      <div className="phoneme-grid">
        {segmental.map((p) => (
          <span key={p} className="phoneme-tile">{p}</span>
        ))}
      </div>
      {usesTones && tones.length > 0 && (
        <div className="phoneme-grid" style={{ marginTop: 6 }}>
          {tones.map((t) => (
            <span key={t} className="phoneme-tile tonal">{t || "none"}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function pickDemoStem(
  lang: import("../engine/types").Language,
  pos: "noun" | "verb",
): string | undefined {
  const candidates = Object.keys(lang.lexicon).filter((m) => !m.includes("-"));
  for (const m of candidates) if (posOf(m) === pos) return m;
  for (const m of Object.keys(lang.lexicon)) if (posOf(m) === pos) return m;
  return undefined;
}

function ParadigmTable({ lang }: { lang: import("../engine/types").Language }) {
  const paradigms = lang.morphology.paradigms;
  const cats = Object.keys(paradigms) as MorphCategory[];
  if (cats.length === 0) {
    return (
      <div className="t-muted" style={{ marginTop: 10, fontSize: 11 }}>
        No morphology yet.
      </div>
    );
  }
  const nounCats = cats.filter((c) => c.startsWith("noun."));
  const verbCats = cats.filter((c) => c.startsWith("verb."));
  const otherCats = cats.filter(
    (c) => !c.startsWith("noun.") && !c.startsWith("verb."),
  );
  const nounStem = pickDemoStem(lang, "noun");
  const verbStem = pickDemoStem(lang, "verb");
  return (
    <div style={{ marginTop: 10 }}>
      {nounCats.length > 0 && (
        <ParadigmGroup
          lang={lang}
          stem={nounStem}
          label="Noun morphology"
          cats={nounCats}
        />
      )}
      {verbCats.length > 0 && (
        <ParadigmGroup
          lang={lang}
          stem={verbStem}
          label="Verb morphology"
          cats={verbCats}
        />
      )}
      {otherCats.length > 0 && (
        <ParadigmGroup
          lang={lang}
          stem={nounStem ?? verbStem}
          label="Other morphology"
          cats={otherCats}
        />
      )}
    </div>
  );
}

function ParadigmGroup({
  lang,
  stem,
  label,
  cats,
}: {
  lang: import("../engine/types").Language;
  stem: string | undefined;
  label: string;
  cats: MorphCategory[];
}) {
  const script = useSimStore((s) => s.displayScript);
  const paradigms = lang.morphology.paradigms;
  const stemForm = stem ? lang.lexicon[stem] : undefined;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="label-line" style={{ marginBottom: 4 }}>
        {label}
        {stem && (
          <>
            {" — "}
            showing "<span className="t-text">{stem}</span>" inflected
          </>
        )}
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: "'SF Mono', Menlo, monospace",
          fontSize: 11,
        }}
      >
        <tbody>
          {cats.map((cat) => {
            const p = paradigms[cat];
            if (!p) return null;
            const inflected = stemForm
              ? formatForm(inflect(stemForm, p, lang, stem!), lang, script)
              : "—";
            return (
              <tr key={cat}>
                <td className="t-muted" style={{ padding: "2px 6px" }}>
                  {cat}
                </td>
                <td className="t-muted" style={{ padding: "2px 6px" }}>
                  /{formToString(p.affix)}/ ({p.position})
                  {p.source && (
                    <span
                      style={{ marginLeft: 6, color: "#7be0b5" }}
                      title={`grammaticalized from "${p.source.meaning}" via ${p.source.pathway} pathway${
                        p.source.pathway === "deixis" && cat.startsWith("noun.case.nom")
                          ? " — this is the classic demonstrative → article pathway"
                          : ""
                      }`}
                    >
                      ← {p.source.meaning}
                      {p.source.pathway === "deixis" &&
                        cat.startsWith("noun.case.nom") && (
                          <span
                            style={{
                              marginLeft: 4,
                              padding: "0 4px",
                              borderRadius: "var(--r-pill)",
                              background: "rgba(123, 224, 181, 0.15)",
                              fontSize: "0.85em",
                            }}
                          >
                            article
                          </span>
                        )}
                    </span>
                  )}
                </td>
                <td style={{ padding: "2px 6px" }}>{inflected}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GrammarFeatureList({
  grammar,
  lang,
}: {
  grammar: import("../engine/types").GrammarFeatures;
  lang: import("../engine/types").Language;
}) {
  const stress = lang.stressPattern ?? "penult";
  const lexCount = lang.lexicalStress ? Object.keys(lang.lexicalStress).length : 0;
  const stressLabel =
    stress === "lexical"
      ? `lexical${lexCount > 0 ? ` · ${lexCount} overrides` : ""}`
      : stress;
  const rows: Array<[string, string]> = [
    ["word order", grammar.wordOrder],
    ["affix position", grammar.affixPosition],
    ["plural marking", grammar.pluralMarking],
    ["tense marking", grammar.tenseMarking],
    ["case", grammar.hasCase ? "yes" : "no"],
    ["gender count", String(grammar.genderCount)],
    ["stress", stressLabel],
  ];
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 12,
      }}
    >
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td style={{ padding: "3px 6px", color: "var(--muted)" }}>{k}</td>
            <td style={{ padding: "3px 6px", color: "var(--text)" }}>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
