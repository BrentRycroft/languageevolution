import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { inflect } from "../engine/morphology/evolve";
import type { MorphCategory } from "../engine/morphology/types";
import { formToString } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import { posOf } from "../engine/lexicon/pos";
import { PRODUCTIVITY_THRESHOLD } from "../engine/lexicon/derivation";
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
          <ProductiveDerivationalRules lang={selected} />
          <GrammaticalisationTimeline lang={selected} />
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

/**
 * Phase 29 Tranche 4f: condensed timeline of grammaticalisation +
 * reanalysis events for the selected language. Surfaces what was
 * previously buried in the global EventsLog with no per-language
 * filter, so you can see at a glance which content words have been
 * promoted to grammatical morphology over time.
 */
function GrammaticalisationTimeline({
  lang,
}: {
  lang: import("../engine/types").Language;
}) {
  const events = (lang.events ?? []).filter(
    (e) =>
      e.kind === "grammaticalize" ||
      e.kind === "grammar_shift" && e.description.startsWith("reanalysis"),
  );
  if (events.length === 0) return null;
  const recent = events.slice(-10).reverse();
  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ marginBottom: 4 }}>Grammaticalisation timeline</h4>
      <table className="paradigm-table" style={{ width: "100%", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "right", width: 50 }}>gen</th>
            <th style={{ textAlign: "left" }}>event</th>
          </tr>
        </thead>
        <tbody>
          {recent.map((e, i) => (
            <tr key={`${e.generation}-${i}`}>
              <td style={{ textAlign: "right", color: "var(--muted)" }}>
                {e.generation}
              </td>
              <td>{e.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {events.length > recent.length && (
        <div className="t-muted" style={{ fontSize: 10, marginTop: 4 }}>
          showing {recent.length} of {events.length} — full list in Events tab
        </div>
      )}
    </div>
  );
}

/**
 * Phase 22: surface productive derivational suffixes as grammatical rules
 * (parallel to inflectional paradigms above). A suffix is shown here once
 * `productive === true` (i.e. it crossed PRODUCTIVITY_THRESHOLD attestations).
 */
function ProductiveDerivationalRules({
  lang,
}: {
  lang: import("../engine/types").Language;
}) {
  const all = lang.derivationalSuffixes ?? [];
  const suffixes = all.filter((s) => s.productive);
  if (suffixes.length === 0) {
    if (all.length === 0) return null;
    // Phase 29 Tranche 4d: surface near-miss suffixes — top 3 by
    // attestation count with a progress bar to PRODUCTIVITY_THRESHOLD,
    // so users can see which derivational patterns are about to
    // become productive.
    const candidates = all
      .slice()
      .sort((a, b) => (b.usageCount ?? 0) - (a.usageCount ?? 0))
      .slice(0, 3);
    return (
      <div style={{ marginTop: 12 }}>
        <h4 style={{ marginBottom: 4 }}>Productive derivational rules</h4>
        <div className="t-muted" style={{ fontSize: 11, marginBottom: 6 }}>
          No productive rules yet — the language has {all.length}{" "}
          derivational suffix{all.length === 1 ? "" : "es"} below the
          productivity threshold ({PRODUCTIVITY_THRESHOLD} attestations).
        </div>
        <table className="paradigm-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Category</th>
              <th style={{ textAlign: "left" }}>Suffix</th>
              <th style={{ textAlign: "right" }}>Attestations</th>
              <th style={{ textAlign: "left" }}>Progress</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((s) => {
              const pct = Math.min(
                100,
                Math.round(((s.usageCount ?? 0) / PRODUCTIVITY_THRESHOLD) * 100),
              );
              return (
                <tr key={s.tag}>
                  <td>{readableCategory(s.category)}</td>
                  <td>
                    <code>{s.tag}</code>
                  </td>
                  <td style={{ textAlign: "right", color: "var(--muted)" }}>
                    {s.usageCount ?? 0}/{PRODUCTIVITY_THRESHOLD}
                  </td>
                  <td>
                    <div
                      style={{
                        width: 80,
                        height: 6,
                        background: "var(--panel-2)",
                        borderRadius: 3,
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          background: "var(--accent)",
                          borderRadius: 3,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
  // Build per-suffix examples by reading wordOriginChain entries whose via
  // matches the suffix tag. Up to 3 examples per rule.
  const examplesBySuffix = new Map<string, string[]>();
  for (const [meaning, chain] of Object.entries(lang.wordOriginChain ?? {})) {
    if (!chain || chain.tag !== "derivation" || !chain.via) continue;
    const list = examplesBySuffix.get(chain.via) ?? [];
    if (list.length < 3) list.push(meaning);
    examplesBySuffix.set(chain.via, list);
  }
  return (
    <div style={{ marginTop: 12 }}>
      <h4 style={{ marginBottom: 4 }}>Productive derivational rules</h4>
      <table className="paradigm-table" style={{ width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Category</th>
            <th style={{ textAlign: "left" }}>Suffix</th>
            <th style={{ textAlign: "right" }}>Established</th>
            <th style={{ textAlign: "right" }}>Attestations</th>
            <th style={{ textAlign: "left" }}>Examples</th>
          </tr>
        </thead>
        <tbody>
          {suffixes.map((s) => {
            const examples = examplesBySuffix.get(s.tag) ?? [];
            return (
              <tr key={s.tag}>
                <td>{readableCategory(s.category)}</td>
                <td>
                  <code>{s.tag}</code>
                </td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>
                  {s.establishedGeneration !== undefined
                    ? `gen ${s.establishedGeneration}`
                    : "—"}
                </td>
                <td style={{ textAlign: "right", color: "var(--muted)" }}>
                  {s.usageCount ?? 0}
                </td>
                <td style={{ color: "var(--muted)" }}>
                  {examples.length > 0 ? examples.join(", ") : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function readableCategory(c: string | undefined): string {
  switch (c) {
    case "agentive": return "agent noun";
    case "abstractNoun": return "abstract noun";
    case "dominionAbstract": return "dominion / abstract realm";
    case "nominalisation": return "nominalisation";
    case "diminutive": return "diminutive";
    case "adjectival": return "adjective";
    case "denominal": return "denominal verb";
    default: return "derivation";
  }
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
  // Phase 39o: expanded typology table — surface previously-hidden
  // axes (caseStrategy, articlePresence, demonstrativeDistance, etc.)
  const rows: Array<[string, string]> = [
    ["word order", grammar.wordOrder],
    ["alignment", grammar.alignment ?? "nom-acc"],
    ["case", grammar.hasCase ? `yes (${grammar.caseStrategy ?? "case"})` : `no (${grammar.caseStrategy ?? "preposition"})`],
    ["gender count", String(grammar.genderCount)],
    ["affix position", grammar.affixPosition],
    ["plural marking", grammar.pluralMarking],
    ["tense marking", grammar.tenseMarking],
    ["aspect", grammar.aspectSystem ?? "—"],
    ["mood", grammar.moodMarking ?? "—"],
    ["evidential", grammar.evidentialMarking ?? "—"],
    ["politeness", grammar.politenessRegister ?? "—"],
    ["articles", grammar.articlePresence ?? "—"],
    ["number", grammar.numberSystem ?? "—"],
    ["demonstrative", grammar.demonstrativeDistance ?? "—"],
    ["impersonal exist.", grammar.impersonalExistential ?? "—"],
    ["numeral base", grammar.numeralBase ?? "—"],
    ["numeral order", grammar.numeralOrder ?? "—"],
    ["adjective pos", grammar.adjectivePosition ?? "—"],
    ["possessor pos", grammar.possessorPosition ?? "—"],
    ["synthesis idx", grammar.synthesisIndex !== undefined ? grammar.synthesisIndex.toFixed(1) : "—"],
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
