import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { posOf } from "../engine/lexicon/pos";
import { verbCitationForm } from "../engine/morphology/citation";
import { CONCEPTS, tierOf, TIER_LABELS } from "../engine/lexicon/concepts";
import { prettyGloss } from "../engine/lexicon/word";
import { formatForm } from "../engine/phonology/display";
import { formatElapsed } from "../engine/time";
import { YEARS_PER_GENERATION } from "../engine/constants";
import type { Language, Meaning } from "../engine/types";
import { lexKeys, lexGet, lexSize } from "../engine/lexicon/access";
import { satGet } from "../engine/lexicon/satellites";
import { cosineFixed } from "../engine/semantics/vec";
import { meaningPointFor } from "../engine/semantics/meaningPoint";
import { readoutProfile, READOUT_AXES, type ReadoutAxis } from "../engine/semantics/readoutAxes";
import { wordMorphemes } from "../engine/semantics/languageMorphemes";
import { homonymsOf } from "../engine/semantics/homonyms";
import { glossOfWord } from "../engine/semantics/anchorIndex";
import { findPrimaryWordForMeaning } from "../engine/lexicon/word";

/**
 * DictionaryView.tsx
 *
 * React app: tabs, controls, lexicon table, narrative panes, grammar view, etc. Key exports: DictionaryView.
 *
 * See CLAUDE.md and ARCHITECTURE.md for the broader design context.
 */

export function DictionaryView() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const script = useSimStore((s) => s.displayScript);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"meaning" | "pos" | "tier">("meaning");
  const [selected, setSelected] = useState<Meaning | null>(null);

  const lang: Language | null = (() => {
    const id = selectedLangId ?? state.rootId;
    return state.tree[id]?.language ?? null;
  })();

  const rows = useMemo(() => {
    if (!lang) return [];
    const meanings = lexKeys(lang);
    const q = search.toLowerCase();
    const filtered = search
      ? meanings.filter(
          (m) =>
            m.toLowerCase().includes(q) ||
            prettyGloss(m).toLowerCase().includes(q),
        )
      : meanings;
    const data = filtered.map((m) => {
      const origin = satGet(lang, "wordOrigin", m);
      const isLoan = origin?.startsWith("borrow:");
      const pos = posOf(m);
      // Phase 26b: render verbs in their citation form (infinitive). For
      // English: "to go". For Romance: "amare". For bare-strategy
      // languages: same as the bare lexicon form.
      let displayForm = formatForm(lexGet(lang, m)!, lang, script);
      if (pos === "verb") {
        const cit = verbCitationForm(lang, m);
        if (cit) {
          if (cit.kind === "single") {
            displayForm = formatForm(cit.form, lang, script, m);
          } else {
            displayForm =
              formatForm(cit.particle, lang, script) +
              " " +
              formatForm(cit.root, lang, script, m);
          }
        }
      }
      const word = findPrimaryWordForMeaning(lang, m);
      const emergentGloss = word ? glossOfWord(word) : m;
      const hasDrifted = emergentGloss !== m;
      return {
        meaning: m,
        gloss: prettyGloss(m),
        emergentGloss,
        hasDrifted,
        form: displayForm,
        pos,
        cluster: CONCEPTS[m]?.cluster ?? "—",
        tier: tierOf(m),
        origin,
        isLoan,
      };
    });
    if (sortBy === "meaning") data.sort((a, b) => a.gloss.localeCompare(b.gloss));
    else if (sortBy === "pos") data.sort((a, b) => a.pos.localeCompare(b.pos) || a.gloss.localeCompare(b.gloss));
    else if (sortBy === "tier") data.sort((a, b) => a.tier - b.tier || a.gloss.localeCompare(b.gloss));
    return data;
  }, [lang, search, sortBy, script]);

  if (!lang) {
    return <div className="section-empty">No language selected.</div>;
  }

  return (
    <div className="col-12">
      <DictionaryHeader lang={lang} entryCount={lexSize(lang)} />
      <GrammarCard lang={lang} />

      {selected && (
        <SemanticProfile
          lang={lang}
          meaning={selected}
          script={script}
          onClose={() => setSelected(null)}
        />
      )}

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
          {rows.length} of {lexSize(lang)} entries
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
              <tr
                key={r.meaning}
                onClick={() => setSelected(r.meaning)}
                className={selected === r.meaning ? "is-selected" : undefined}
                style={{
                  cursor: "pointer",
                  background:
                    selected === r.meaning ? "var(--panel-2)" : undefined,
                }}
                title="Show semantic profile"
              >
                <td title={r.gloss !== r.meaning ? `concept id: ${r.meaning}` : undefined}>
                  {r.hasDrifted ? prettyGloss(r.emergentGloss) : r.gloss}
                  {r.hasDrifted && (
                    <span
                      className="t-accent fs-1"
                      style={{ marginLeft: 6 }}
                      title={`Seeded as: ${r.gloss}`}
                    >
                      (now: {prettyGloss(r.emergentGloss)} · seeded: {r.gloss})
                    </span>
                  )}
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

/**
 * MEGA-overhaul (meaning model = continuous space): make the embedding visible.
 * For a selected word, show its nearest neighbours *in this language* (cosine over the
 * shipped distributional embedding) and its interpretable readout-axis profile — the two
 * faces of the hybrid model (dense space + named axes) the project settled on.
 */
function SemanticProfile({
  lang,
  meaning,
  script,
  onClose,
}: {
  lang: Language;
  meaning: Meaning;
  script: "ipa" | "roman" | "both";
  onClose: () => void;
}) {
  const data = useMemo(() => {
    const target = meaningPointFor(lang, meaning);
    const nearest = lexKeys(lang)
      .filter((k) => k !== meaning)
      .map((k) => ({ m: k, s: cosineFixed(target, meaningPointFor(lang, k)) }))
      .filter((x) => x.s > 0.2)
      .sort((a, b) => b.s - a.s)
      .slice(0, 8);
    const axes = readoutProfile(meaning);
    const breakdown = wordMorphemes(lang, meaning)?.map((m) => m.id) ?? null;
    const homonyms = homonymsOf(lang, meaning);
    const drifted = !!lang.meaningPoints?.[meaning];
    return { nearest, axes, breakdown, homonyms, drifted };
  }, [lang, meaning]);

  const selfForm = lexGet(lang, meaning);

  return (
    <div
      style={{
        marginTop: 8,
        padding: "10px 14px",
        border: "1px solid var(--accent)",
        borderRadius: "var(--r-2)",
        background: "var(--panel-2)",
      }}
    >
      <div className="row-8 items-center" style={{ justifyContent: "space-between" }}>
        <div className="row-8 items-center">
          <strong>{prettyGloss(meaning)}</strong>
          {selfForm && (
            <span className="mono t-muted">
              {formatForm(selfForm, lang, script, meaning)}
            </span>
          )}
          <span className="t-muted fs-1">semantic profile</span>
          {data.drifted && (
            <span
              className="t-accent fs-1"
              title="this meaning has drifted from its original position in the space"
            >
              drifted
            </span>
          )}
        </div>
        <button
          type="button"
          className="fs-1 t-muted"
          onClick={onClose}
          aria-label="Close semantic profile"
          style={{ background: "none", border: "none", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {data.breakdown && (
        <div className="row-8 items-center fs-1" style={{ marginTop: 8, flexWrap: "wrap" }}>
          <span className="label-line">morphemes</span>
          {data.breakdown.map((p, i) => {
            const pf = lexGet(lang, p);
            return (
              <span key={`${p}-${i}`} className="row-4 items-center">
                {i > 0 && <span className="t-muted">+</span>}
                <span>{prettyGloss(p)}</span>
                {pf && <span className="mono t-muted">{formatForm(pf, lang, script, p)}</span>}
              </span>
            );
          })}
        </div>
      )}

      {data.homonyms.length > 0 && (
        <div
          className="row-8 items-center fs-1"
          style={{ marginTop: 8, flexWrap: "wrap" }}
        >
          <span
            className="label-line"
            title="same form, distant meaning — distinct words that merely sound alike"
          >
            homonyms
          </span>
          {data.homonyms.map((h) => {
            const hf = lexGet(lang, h);
            return (
              <span key={h} className="row-4 items-center">
                <span>{prettyGloss(h)}</span>
                {hf && <span className="mono t-muted">{formatForm(hf, lang, script, h)}</span>}
              </span>
            );
          })}
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          marginTop: 10,
        }}
      >
        <div>
          <div className="label-line" style={{ marginBottom: 6 }}>
            nearest words in {lang.name}
          </div>
          {data.nearest.length === 0 && (
            <div className="t-muted fs-1">no close neighbours in this lexicon.</div>
          )}
          {data.nearest.map(({ m, s }) => {
            const f = lexGet(lang, m);
            return (
              <div key={m} className="row-8 items-center fs-1" style={{ padding: "1px 0" }}>
                <span style={{ flex: 1 }}>{prettyGloss(m)}</span>
                {f && <span className="mono t-muted">{formatForm(f, lang, script, m)}</span>}
                <span className="t-accent" style={{ width: 38, textAlign: "right" }}>
                  {(s * 100).toFixed(0)}%
                </span>
              </div>
            );
          })}
        </div>

        <div>
          <div className="label-line" style={{ marginBottom: 6 }}>
            semantic axes
          </div>
          {(Object.keys(READOUT_AXES) as ReadoutAxis[]).map((axis) => (
            <AxisBar key={axis} axis={axis} value={data.axes[axis]} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AxisBar({ axis, value }: { axis: ReadoutAxis; value: number }) {
  const [pos, neg] = READOUT_AXES[axis];
  const v = Math.max(-1, Math.min(1, value));
  const pct = Math.abs(v) * 50; // half-width fill from the centre
  return (
    <div className="row-8 items-center fs-1" style={{ padding: "2px 0" }}>
      <span className="t-muted" style={{ width: 78 }} title={`${axis}: ${pos} ↔ ${neg}`}>
        {axis}
      </span>
      <div
        style={{
          position: "relative",
          flex: 1,
          height: 8,
          background: "var(--panel)",
          borderRadius: 4,
          overflow: "hidden",
        }}
      >
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border)" }} />
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            background: v >= 0 ? "var(--accent)" : "var(--danger)",
            left: v >= 0 ? "50%" : `${50 - pct}%`,
            width: `${pct}%`,
          }}
        />
      </div>
      <span className="mono t-muted" style={{ width: 36, textAlign: "right" }}>
        {v >= 0 ? "+" : ""}
        {v.toFixed(2)}
      </span>
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
