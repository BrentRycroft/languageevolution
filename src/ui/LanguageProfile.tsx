import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { formatForm } from "../engine/phonology/display";
import { TIER_LABELS } from "../engine/lexicon/concepts";
import { topRegularCorrespondences } from "../engine/phonology/soundLaws";
import { closedClassForm } from "../engine/translator/closedClass";
import { selectSynonyms } from "../engine/lexicon/word";

/**
 * Phase 32 Tranche 32d: language profile card. The TL;DR view —
 * given a selected language, surface its typological class,
 * cultural status, distinguishing phonology, and a handful of
 * sample words. A linguist or a returning user reads this card
 * and immediately knows "what kind of language this is."
 */
export function LanguageProfile() {
  const state = useSimStore((s) => s.state);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const script = useSimStore((s) => s.displayScript);
  const selectLanguage = useSimStore((s) => s.selectLanguage);

  const aliveLeaves = useMemo(
    () => leafIds(state.tree).filter((id) => !state.tree[id]!.language.extinct),
    [state.tree],
  );
  const fallbackId = selectedLangId ?? aliveLeaves[0] ?? state.rootId;
  const lang = state.tree[fallbackId]?.language;

  if (!lang) {
    return (
      <div style={{ color: "var(--muted)", padding: 12 }}>
        No language selected.
      </div>
    );
  }

  const tier = (lang.culturalTier ?? 0) as 0 | 1 | 2 | 3;
  const tierIcon = ["🌿", "🌾", "🛕", "🏭"][tier];

  // Typological badge string — pulled from grammar features.
  const wo = lang.grammar.wordOrder;
  const morph =
    (lang.grammar.synthesisIndex ?? 0.5) >= 1.5
      ? "synthetic"
      : (lang.grammar.synthesisIndex ?? 0.5) >= 0.8
        ? "fusional"
        : "isolating";
  const articleDesc = lang.grammar.articlePresence ?? "none";
  const caseStrat = lang.grammar.caseStrategy ?? "preposition";

  // Top sound correspondences (Phase 29 Tranche 5d).
  const correspondences = useMemo(
    () => topRegularCorrespondences(lang, 4, 0.4, 5),
    [lang],
  );

  // Sample 8 core words for a flavour-shot.
  const SAMPLES = [
    "water", "fire", "mother", "father",
    "sun", "moon", "go", "see",
  ];
  const sampleWords = SAMPLES.map((m) => {
    const f = lang.lexicon[m];
    return { meaning: m, form: f ? formatForm(f, lang, script, m) : null };
  }).filter((s) => s.form);

  // Distinguishing active rules (top 3 by strength).
  const activeRules = (lang.activeRules ?? [])
    .slice()
    .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 3);

  // Family lineage — walk parents up to root.
  const lineage: string[] = [];
  let cur: string | null = lang.id;
  while (cur) {
    const parent: string | null = state.tree[cur]?.parentId ?? null;
    if (!parent) break;
    lineage.unshift(state.tree[parent]?.language.name ?? parent);
    cur = parent;
  }

  return (
    <div style={{ fontSize: "var(--fs-2)", maxWidth: 720, padding: 8 }}>
      <div
        style={{
          padding: "12px 16px",
          background: "var(--panel-2)",
          borderRadius: "var(--r-2)",
          border: "1px solid var(--border)",
          marginBottom: 12,
        }}
      >
        <h2 style={{ margin: 0, fontSize: "var(--fs-5)" }}>{lang.name}</h2>
        <div className="t-muted" style={{ fontSize: "var(--fs-1)", marginTop: 2 }}>
          {lineage.length > 0 ? `${lineage.join(" → ")} → ` : ""}
          {lang.name}
          {lang.extinct ? " (extinct)" : ""}
        </div>
        <div style={{ marginTop: 8, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span title={`Cultural tier: ${TIER_LABELS[tier]}`}>{tierIcon} {TIER_LABELS[tier]}</span>
          <span>{(lang.speakers ?? 0).toLocaleString()} speakers</span>
          <span>gen {lang.birthGeneration} → {state.generation}</span>
          {lang.toneRegime === "tonal" && (
            <span style={{ color: "var(--accent)" }}>tonal</span>
          )}
          {lang.toneRegime === "pitch-accent" && (
            <span style={{ color: "var(--muted)" }}>pitch-accent</span>
          )}
          {lang.volatilityPhase?.kind === "upheaval" && (
            <span style={{ color: "var(--danger)" }}>
              ⚡ rapid-change era
            </span>
          )}
        </div>
      </div>

      <Section title="Typology">
        <Row label="Word order">{wo}</Row>
        <Row label="Morphology">{morph} (synthesis {(lang.grammar.synthesisIndex ?? 0.5).toFixed(2)})</Row>
        <Row label="Case strategy">{caseStrat}{lang.grammar.hasCase ? "" : " (no morphological case)"}</Row>
        <Row label="Articles">{articleDesc}</Row>
        <Row label="Adjective position">{lang.grammar.adjectivePosition ?? "—"}</Row>
        <Row label="Negation">{lang.grammar.negationPosition ?? "—"}</Row>
        <Row label="Stress">{lang.stressPattern ?? "—"}</Row>
        <Row label="Demonstrative">{lang.grammar.demonstrativeDistance ?? "two-way"}</Row>
        <Row label="Number">{lang.grammar.numberSystem ?? "sg-pl"}</Row>
        <Row label="Aspect">{lang.grammar.aspectSystem ?? "simple"}</Row>
        <Row label="Future">{lang.grammar.futureRealisation ?? "synthetic"}</Row>
        <Row label="Perfect">{lang.grammar.perfectRealisation ?? "synthetic"}</Row>
      </Section>

      <Section title="Pronouns">
        <PronounParadigm lang={lang} />
      </Section>

      <Section title="Demonstratives">
        <DemonstrativeParadigm lang={lang} />
      </Section>

      <Section title="Phonology">
        <Row label="Segmental inventory">
          {lang.phonemeInventory.segmental.length} phonemes — {lang.phonemeInventory.segmental.slice(0, 16).join(" ")}
          {lang.phonemeInventory.segmental.length > 16 ? " …" : ""}
        </Row>
        {lang.phonemeInventory.usesTones && (
          <Row label="Tones">{lang.phonemeInventory.tones.join(" ")}</Row>
        )}
        <Row label="Active sound laws">
          {activeRules.length === 0 ? (
            <span className="t-muted">none</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {activeRules.map((r) => (
                <li key={r.id} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-1)" }}>
                  {r.id} (strength {r.strength.toFixed(2)})
                </li>
              ))}
            </ul>
          )}
        </Row>
        <Row label="Top sound correspondences">
          {correspondences.length === 0 ? (
            <span className="t-muted">none yet — run more generations</span>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 16 }}>
              {correspondences.map((c) => (
                <li key={`${c.from}>${c.to}@${c.environment}`} style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-1)" }}>
                  /{c.from}/ → /{c.to}/ {c.environment !== "any" ? `(${c.environment})` : ""} — {(c.regularity * 100).toFixed(0)}%
                </li>
              ))}
            </ul>
          )}
        </Row>
      </Section>

      <Section title="Sample lexicon">
        <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
          <tbody>
            {sampleWords.map(({ meaning, form }) => {
              const synonyms = selectSynonyms(lang, meaning);
              const altForms = synonyms.length > 1
                ? synonyms.slice(1).map((w) => formatForm(w.form, lang, script, meaning))
                : [];
              return (
                <tr key={meaning}>
                  <td style={{ width: 100, color: "var(--muted)" }}>{meaning}</td>
                  <td style={{ fontFamily: "var(--font-mono)" }}>
                    {form}
                    {altForms.length > 0 && (
                      <span className="t-muted" style={{ marginLeft: 8, fontSize: "var(--fs-1)" }}>
                        ~ {altForms.join(", ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Section>

      <Section title="Lexicon stats">
        <LexiconStats lang={lang} />
      </Section>

      {aliveLeaves.length > 1 && (
        <div style={{ marginTop: 12, fontSize: "var(--fs-1)" }}>
          <span className="t-muted">Switch language: </span>
          {aliveLeaves
            .filter((id) => id !== lang.id)
            .slice(0, 8)
            .map((id) => (
              <button
                key={id}
                type="button"
                className="ghost"
                onClick={() => selectLanguage(id)}
                style={{ marginRight: 4, fontSize: "var(--fs-1)" }}
              >
                {state.tree[id]!.language.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

/**
 * Phase 35 Tranche 35b: pronoun paradigm panel. Surfaces all
 * pronoun lemmas (i/me/my/mine, you/your, he/him/his, etc.) in a
 * single grid keyed by person × case. Reads from lang.lexicon
 * directly — currently the simulator stores each pronoun lemma as
 * a separate entry rather than a paradigm. The panel pulls them
 * back together.
 */
function PronounParadigm({
  lang,
}: {
  lang: import("../engine/types").Language;
}) {
  const ROWS: Array<{
    label: string;
    nom?: string;
    acc?: string;
    poss?: string;
  }> = [
    { label: "1sg", nom: "i", acc: "me", poss: "my" },
    { label: "2sg", nom: "you", acc: "you", poss: "your" },
    { label: "3sg.m", nom: "he", acc: "him", poss: "his" },
    { label: "3sg.f", nom: "she", acc: "her", poss: "her" },
    { label: "3sg.n", nom: "it", acc: "it", poss: "its" },
    { label: "1pl", nom: "we", acc: "us", poss: "our" },
    { label: "2pl", nom: "you", acc: "you", poss: "your" },
    { label: "3pl", nom: "they", acc: "them", poss: "their" },
  ];
  const script = useSimStore.getState().displayScript;
  return (
    <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
      <thead>
        <tr>
          <th style={{ width: 60, textAlign: "left" }}></th>
          <th style={{ textAlign: "left" }}>NOM</th>
          <th style={{ textAlign: "left" }}>ACC/OBJ</th>
          <th style={{ textAlign: "left" }}>POSS</th>
        </tr>
      </thead>
      <tbody>
        {ROWS.map((r) => {
          const lemmas = [r.nom, r.acc, r.poss];
          const present = lemmas.some((l) => l && lang.lexicon[l]);
          if (!present) return null;
          return (
            <tr key={r.label}>
              <td style={{ color: "var(--muted)", width: 60 }}>{r.label}</td>
              {lemmas.map((l, i) => {
                const f = l ? lang.lexicon[l] : null;
                return (
                  <td key={i} style={{ fontFamily: "var(--font-mono)" }}>
                    {f ? formatForm(f, lang, script, l ?? undefined) : <span className="t-muted">—</span>}
                  </td>
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Phase 36 Tranche 36c/36i: demonstrative paradigm panel. Shows the
 * proximal / medial / distal / remote forms reachable in this
 * language under its `demonstrativeDistance` setting. Forms are
 * synthesised via the closed-class table — each lemma carries its
 * own per-language phoneme-hash so the surface forms differ.
 */
function DemonstrativeParadigm({
  lang,
}: {
  lang: import("../engine/types").Language;
}) {
  const distance = lang.grammar.demonstrativeDistance ?? "two-way";
  const ROWS: Array<{ label: string; lemma: string; visible: boolean }> = [
    { label: "proximal (this)", lemma: "this", visible: true },
    { label: distance === "two-way" ? "distal (that)" : "medial (that-near)", lemma: distance === "two-way" ? "that" : "that_near", visible: true },
    { label: "distal (that-far)", lemma: "that_far", visible: distance === "three-way" || distance === "four-way" },
    { label: "remote (yonder)", lemma: "that_remote", visible: distance === "four-way" },
  ];
  const script = useSimStore.getState().displayScript;
  return (
    <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
      <tbody>
        {ROWS.filter((r) => r.visible).map((r) => {
          const f = closedClassForm(lang, r.lemma);
          return (
            <tr key={r.lemma}>
              <td style={{ color: "var(--muted)", width: 180 }}>{r.label}</td>
              <td style={{ fontFamily: "var(--font-mono)" }}>
                {f && f.length > 0 ? formatForm(f, lang, script, r.lemma) : <span className="t-muted">—</span>}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Phase 37 Tranche 37e: lexicon stats panel showing the
 * synonym-vs-homonym balance. A healthy language has noticeably
 * more synonyms (multiple forms per meaning) than homonyms
 * (multiple meanings per form).
 */
function LexiconStats({
  lang,
}: {
  lang: import("../engine/types").Language;
}) {
  const meanings = Object.keys(lang.lexicon);
  const totalMeanings = meanings.length;
  let synonymTotal = 0;
  let meaningsWithSynonym = 0;
  for (const m of meanings) {
    const syns = selectSynonyms(lang, m);
    if (syns.length > 1) {
      meaningsWithSynonym++;
      synonymTotal += syns.length - 1;
    }
  }
  const meanSynonyms = totalMeanings === 0 ? 0 : synonymTotal / totalMeanings;
  const synonymRate = totalMeanings === 0 ? 0 : meaningsWithSynonym / totalMeanings;

  let homonymPairs = 0;
  let formsWithHomonymy = 0;
  if (lang.words) {
    for (const w of lang.words) {
      const realSenses = w.senses.filter((s) => !s.synonym);
      if (realSenses.length >= 2) {
        formsWithHomonymy++;
        homonymPairs += realSenses.length - 1;
      }
    }
  }
  const totalForms = lang.words?.length ?? 0;
  const homonymRate = totalForms === 0 ? 0 : formsWithHomonymy / totalForms;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8 }}>
      <span className="t-muted">Synonyms</span>
      <span>{meanSynonyms.toFixed(2)} per meaning ({(synonymRate * 100).toFixed(0)}% have ≥ 1)</span>
      <span className="t-muted">Homonyms</span>
      <span>{homonymPairs} pairs ({(homonymRate * 100).toFixed(0)}% of forms)</span>
      <span className="t-muted">Forms / meanings</span>
      <span>{totalForms} forms / {totalMeanings} meanings</span>
      <span className="t-muted">Coinages</span>
      <span>{lang.totalCoinages ?? 0} since gen {lang.birthGeneration}</span>
      {lang.literaryStability !== undefined && lang.literaryStability > 0 && (
        <>
          <span className="t-muted">Literary stability</span>
          <span>{(lang.literaryStability * 100).toFixed(0)}% (slows phonology + grammar)</span>
        </>
      )}
      {lang.grammaticalisationCascade && (
        <>
          <span className="t-muted">Cascade</span>
          <span style={{ color: "var(--accent)" }}>×{lang.grammaticalisationCascade.multiplier.toFixed(1)} until gen {lang.grammaticalisationCascade.until}</span>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-1)",
        padding: 12,
        marginBottom: 8,
      }}
    >
      <h3 style={{ margin: "0 0 8px", fontSize: "var(--fs-3)" }}>{title}</h3>
      <div>{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 8, marginBottom: 4 }}>
      <span className="t-muted">{label}</span>
      <span>{children}</span>
    </div>
  );
}
