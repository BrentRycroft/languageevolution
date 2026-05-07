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

      {/* Phase 39d: surface previously-orphaned engine state. Each
          subsection is gated on the field being non-empty so they
          stay invisible for languages that don't use the feature. */}
      {lang.nounClassAssignments && Object.keys(lang.nounClassAssignments).length >= 5 && (
        <Section title="Noun classes">
          <NounClassPanel lang={lang} />
        </Section>
      )}
      {lang.boundMorphemes && lang.boundMorphemes.size > 0 && (
        <Section title="Bound morphemes (productive affixes)">
          <BoundMorphemesPanel lang={lang} />
        </Section>
      )}
      {lang.compounds && Object.keys(lang.compounds).length > 0 && (
        <Section title="Compounds">
          <CompoundsPanel lang={lang} />
        </Section>
      )}
      {lang.borrowHistory && Object.keys(lang.borrowHistory).length > 0 && (
        <Section title="Borrow history">
          <BorrowHistoryPanel lang={lang} />
        </Section>
      )}
      {lang.categoryMomentum && Object.keys(lang.categoryMomentum).length > 0 && (
        <Section title="Active sound-change momentum">
          <CategoryMomentumPanel lang={lang} gen={state.generation} />
        </Section>
      )}
      {lang.toneSandhiRules && lang.toneSandhiRules.length > 0 && (
        <Section title="Tone sandhi">
          <div style={{ fontSize: "var(--fs-1)" }}>
            {lang.toneSandhiRules.map((r) => <span key={r} style={{ marginRight: 8 }}>{r}</span>)}
          </div>
        </Section>
      )}
      {lang.activeModules instanceof Set && lang.activeModules.size > 0 && (
        <Section title="Active modules">
          <ActiveModulesPanel lang={lang} />
        </Section>
      )}

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

/**
 * Phase 39d: noun-class assignment table. Shows which class each
 * noun belongs to (Bantu-style class 1-8). Engine field
 * `lang.nounClassAssignments` was previously invisible.
 */
function NounClassPanel({ lang }: { lang: import("../engine/types").Language }) {
  const assignments = lang.nounClassAssignments ?? {};
  // Group by class so each class shows its members.
  const byClass = new Map<number, string[]>();
  for (const [meaning, cls] of Object.entries(assignments)) {
    const arr = byClass.get(cls) ?? [];
    arr.push(meaning);
    byClass.set(cls, arr);
  }
  const sortedClasses = Array.from(byClass.keys()).sort((a, b) => a - b);
  return (
    <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
      <tbody>
        {sortedClasses.map((cls) => (
          <tr key={cls}>
            <td style={{ width: 80, color: "var(--muted)" }}>class {cls}</td>
            <td style={{ fontFamily: "var(--font-mono)" }}>
              {byClass.get(cls)!.slice(0, 12).join(", ")}
              {byClass.get(cls)!.length > 12 ? ` …+${byClass.get(cls)!.length - 12}` : ""}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Phase 39d: bound-morpheme list with current form + introduction
 * generation + replacement chain. Engine fields `lang.boundMorphemes`
 * + `lang.boundMorphemeOrigin` were previously invisible.
 */
function BoundMorphemesPanel({ lang }: { lang: import("../engine/types").Language }) {
  const morphemes = lang.boundMorphemes;
  if (!morphemes) return null;
  const list = Array.from(morphemes);
  return (
    <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
      <tbody>
        {list.map((m) => {
          const form = lang.lexicon[m];
          const origin = lang.boundMorphemeOrigin?.[m];
          return (
            <tr key={m}>
              <td style={{ width: 100, color: "var(--muted)" }}>{m}</td>
              <td style={{ fontFamily: "var(--font-mono)" }}>
                {form ? form.join("") : <span className="t-muted">∅</span>}
                {origin?.obsolescentGen !== undefined && (
                  <span className="t-muted" style={{ marginLeft: 6 }}>
                    obsolescent (gen {origin.obsolescentGen})
                    {origin.replacedBy && ` → ${origin.replacedBy}`}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/**
 * Phase 39d: compound list (transparent vs fossilised).
 */
function CompoundsPanel({ lang }: { lang: import("../engine/types").Language }) {
  const compounds = lang.compounds;
  if (!compounds) return null;
  const entries = Object.entries(compounds);
  const transparent = entries.filter(([, m]) => !m.fossilized);
  const fossilised = entries.filter(([, m]) => m.fossilized);
  return (
    <div style={{ fontSize: "var(--fs-1)" }}>
      <div style={{ marginBottom: 4 }}>
        <span className="t-muted">{transparent.length} transparent · {fossilised.length} fossilised</span>
      </div>
      <table className="paradigm-table" style={{ width: "100%" }}>
        <tbody>
          {transparent.slice(0, 8).map(([meaning, meta]) => (
            <tr key={meaning}>
              <td style={{ width: 110, color: "var(--muted)" }}>{meaning}</td>
              <td style={{ fontFamily: "var(--font-mono)" }}>
                {meta.parts.join(" + ")}
              </td>
            </tr>
          ))}
          {fossilised.slice(0, 4).map(([meaning, meta]) => (
            <tr key={meaning} style={{ opacity: 0.7 }}>
              <td style={{ width: 110, color: "var(--muted)" }}>{meaning}</td>
              <td style={{ fontFamily: "var(--font-mono)" }}>
                {meta.parts.join(" + ")}
                <span className="t-muted" style={{ marginLeft: 6 }}>(fossilised gen {meta.fossilizedGen})</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Phase 39d: most-recent borrow history. Each meaning shows up to
 * 3 borrowing events with donor + surface form.
 */
function BorrowHistoryPanel({ lang }: { lang: import("../engine/types").Language }) {
  const history = lang.borrowHistory;
  if (!history) return null;
  // Flatten to (meaning, event) pairs, sort by generation desc, take top 10.
  const all: Array<{ meaning: string; gen: number; from: string; surface: string }> = [];
  for (const [meaning, events] of Object.entries(history)) {
    for (const ev of events) all.push({ meaning, gen: ev.generation, from: ev.fromLangId, surface: ev.surface });
  }
  all.sort((a, b) => b.gen - a.gen);
  const recent = all.slice(0, 10);
  return (
    <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
      <tbody>
        {recent.map((ev, i) => (
          <tr key={`${ev.meaning}-${i}`}>
            <td style={{ width: 100, color: "var(--muted)" }}>gen {ev.gen}</td>
            <td>
              <span style={{ fontFamily: "var(--font-mono)", marginRight: 6 }}>{ev.surface}</span>
              <span className="t-muted">{ev.meaning} ← {ev.from}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Phase 39d: live category-momentum tracker. Shows which sound-change
 * categories currently have a momentum boost active and how many gens
 * remain.
 */
function CategoryMomentumPanel({ lang, gen }: { lang: import("../engine/types").Language; gen: number }) {
  const cm = lang.categoryMomentum ?? {};
  const active = Object.entries(cm).filter(([, m]) => m.until > gen);
  if (active.length === 0) return <span className="t-muted">no active boosts</span>;
  return (
    <table className="paradigm-table" style={{ width: "100%", fontSize: "var(--fs-1)" }}>
      <tbody>
        {active.map(([cat, m]) => (
          <tr key={cat}>
            <td style={{ width: 130, color: "var(--muted)" }}>{cat}</td>
            <td>×{m.boost.toFixed(2)} for {m.until - gen} more gens</td>
          </tr>
        ))}
      </tbody>
    </table>
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

/**
 * Phase 50 T6: surfaces the per-language active-module set so the UI
 * makes the Phase-41+ module abstraction visible. Each chip shows a
 * module id (e.g. "grammatical:tense", "morphological:agreement") and
 * a kind prefix tint. Clicking is a no-op for now; the chip is
 * informational.
 */
function ActiveModulesPanel({ lang }: { lang: import("../engine/types").Language }) {
  if (!(lang.activeModules instanceof Set) || lang.activeModules.size === 0) {
    return <div className="t-muted">no modules active</div>;
  }
  const modules = Array.from(lang.activeModules).sort();
  const KIND_HUE: Record<string, number> = {
    grammatical: 200,
    morphological: 30,
    semantic: 140,
    syntactical: 280,
  };
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {modules.map((id) => {
        const kind = id.split(":")[0] ?? "";
        const hue = KIND_HUE[kind] ?? 0;
        return (
          <span
            key={id}
            title={`Active module · ${id}`}
            style={{
              fontSize: 10,
              padding: "2px 6px",
              borderRadius: 999,
              border: `1px solid hsl(${hue} 60% 45% / 0.35)`,
              color: `hsl(${hue} 70% 65%)`,
              background: `hsl(${hue} 50% 25% / 0.18)`,
            }}
          >
            {id}
          </span>
        );
      })}
    </div>
  );
}
