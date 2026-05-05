import { useMemo } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { formatForm } from "../engine/phonology/display";
import { TIER_LABELS } from "../engine/lexicon/concepts";
import { topRegularCorrespondences } from "../engine/phonology/soundLaws";

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
            {sampleWords.map(({ meaning, form }) => (
              <tr key={meaning}>
                <td style={{ width: 100, color: "var(--muted)" }}>{meaning}</td>
                <td style={{ fontFamily: "var(--font-mono)" }}>{form}</td>
              </tr>
            ))}
          </tbody>
        </table>
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
