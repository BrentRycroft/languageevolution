import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { inflect } from "../engine/morphology/evolve";
import type { MorphCategory } from "../engine/morphology/types";
import { formToString } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
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
            {selected.extinct && <span style={{ color: "var(--danger)" }}>(extinct)</span>}
            <span style={{ marginLeft: "auto" }}>
              <ScriptPicker />
            </span>
          </div>
          <GrammarFeatureList grammar={selected.grammar} />
          <InventoryDisplay lang={selected} />
          <ParadigmTable lang={selected} />
        </>
      ) : (
        <div style={{ color: "var(--muted)" }}>Select a language to view grammar.</div>
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

function ParadigmTable({ lang }: { lang: import("../engine/types").Language }) {
  const script = useSimStore((s) => s.displayScript);
  const paradigms = lang.morphology.paradigms;
  const cats = Object.keys(paradigms) as MorphCategory[];
  if (cats.length === 0) {
    return (
      <div style={{ color: "var(--muted)", marginTop: 10, fontSize: 11 }}>
        No morphology yet.
      </div>
    );
  }
  const lexMeanings = Object.keys(lang.lexicon);
  // Use the first short meaning as a demo noun/verb stem.
  const demo = lexMeanings.find((m) => !m.includes("-")) ?? lexMeanings[0];
  const demoForm = demo ? lang.lexicon[demo] : undefined;
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>
        Morphology
        {demo && (
          <>
            {" — "}
            showing "<span style={{ color: "var(--text)" }}>{demo}</span>" inflected
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
            const inflected = demoForm ? formatForm(inflect(demoForm, p), lang, script) : "—";
            return (
              <tr key={cat}>
                <td style={{ padding: "2px 6px", color: "var(--muted)" }}>{cat}</td>
                <td style={{ padding: "2px 6px", color: "var(--muted)" }}>
                  /{formToString(p.affix)}/ ({p.position})
                  {p.source && (
                    <span
                      style={{ marginLeft: 6, color: "#7be0b5" }}
                      title={`grammaticalized from "${p.source.meaning}" via ${p.source.pathway} pathway`}
                    >
                      ← {p.source.meaning}
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

function GrammarFeatureList({ grammar }: { grammar: import("../engine/types").GrammarFeatures }) {
  const rows: Array<[string, string]> = [
    ["word order", grammar.wordOrder],
    ["affix position", grammar.affixPosition],
    ["plural marking", grammar.pluralMarking],
    ["tense marking", grammar.tenseMarking],
    ["case", grammar.hasCase ? "yes" : "no"],
    ["gender count", String(grammar.genderCount)],
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
