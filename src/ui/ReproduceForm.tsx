import { useEffect, useMemo } from "react";
import { useSimStore } from "../state/store";
import { formToString } from "../engine/phonology/ipa";
import { formatForm } from "../engine/phonology/display";
import { CloseIcon } from "./icons";
import { speakForm, ttsAvailable } from "./audio";
import { ScriptPicker } from "./ScriptPicker";

interface Props {
  langId: string;
  meaning: string;
  onClose: () => void;
}

export function ReproduceForm({ langId, meaning, onClose }: Props) {
  const state = useSimStore((s) => s.state);
  const seedForms = useSimStore((s) => s.seedFormsByMeaning);
  const history = useSimStore((s) => s.history);
  const script = useSimStore((s) => s.displayScript);

  const lang = state.tree[langId]?.language;

  const ancestry = useMemo(() => {
    const chain: string[] = [];
    let cur: string | null = langId;
    while (cur) {
      chain.unshift(cur);
      cur = state.tree[cur]?.parentId ?? null;
    }
    return chain;
  }, [langId, state.tree]);

  const seedForm = seedForms[meaning];
  const currentForm = lang?.lexicon[meaning];
  const origin = lang?.wordOrigin?.[meaning];

  // Stitch all per-language history rows for this meaning across the ancestry
  // chain into a single timeline of (generation, language, form) entries.
  const stitchedHistory = useMemo(() => {
    type Row = { generation: number; languageName: string; form: string };
    const rows: Row[] = [];
    for (const id of ancestry) {
      const chainLang = state.tree[id]?.language;
      const langName = chainLang?.name ?? id;
      const entries = history[id]?.[meaning] ?? [];
      for (const e of entries) {
        rows.push({
          generation: e.generation,
          languageName: langName,
          form: chainLang ? formatForm(e.form, chainLang, script) : e.form.join(""),
        });
      }
    }
    rows.sort((a, b) => a.generation - b.generation);
    // Collapse consecutive identical forms.
    const collapsed: Row[] = [];
    for (const r of rows) {
      const last = collapsed[collapsed.length - 1];
      if (!last || last.form !== r.form) collapsed.push(r);
    }
    return collapsed;
  }, [ancestry, history, meaning, state.tree, script]);

  // Sound-change events from the language's own log that we can list as the
  // most likely culprits for the most recent change.
  const recentChanges = useMemo(() => {
    if (!lang) return [];
    return lang.events
      .filter((e) => e.kind === "sound_change")
      .slice(-10)
      .reverse();
  }, [lang]);

  // Esc closes the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!lang) return null;

  return (
    <div
      role="dialog"
      aria-label={`Reproduce form for "${meaning}"`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        zIndex: 200,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "flex-end",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          borderLeft: "1px solid var(--border)",
          boxShadow: "var(--shadow-3)",
          padding: 16,
          width: "min(480px, 100%)",
          height: "100%",
          overflow: "auto",
          animation: "slide-in-right 200ms ease-out",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: "var(--fs-3)" }}>
            How did "{meaning}" become {currentForm && lang ? formatForm(currentForm, lang, script) : "—"}?
          </h3>
          <ScriptPicker />
          {currentForm && ttsAvailable() && (
            <button
              onClick={() => speakForm(formToString(currentForm))}
              aria-label="Speak form aloud"
              title="Speak form aloud (browser TTS)"
              className="ghost"
              style={{ marginLeft: 8, minHeight: 28, padding: "2px 10px" }}
            >
              🔊
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ghost icon-only"
            style={{ marginLeft: "auto" }}
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div style={{ fontSize: "var(--fs-2)", color: "var(--muted)", marginBottom: 12 }}>
          Lineage of {lang.name} from the proto-language. Each row is a recorded
          form change for this meaning along the path.
          {origin && (
            <>
              {" "}
              <span style={{ color: "var(--text)" }}>
                Origin: {origin.startsWith("borrow:") ? `borrowed from ${origin.slice(7)}` : origin}.
              </span>
            </>
          )}
        </div>

        {stitchedHistory.length === 0 ? (
          <div style={{ color: "var(--muted)", fontSize: "var(--fs-2)" }}>
            No recorded form changes — the form is unchanged from{" "}
            {seedForm && lang
              ? `the proto seed (${formatForm(seedForm, lang, script)})`
              : "this language's first appearance"}
            .
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {seedForm && lang && (
              <Row generation={0} language="Proto seed" form={formatForm(seedForm, lang, script)} accent />
            )}
            {stitchedHistory.map((r, i) => (
              <Row
                key={i}
                generation={r.generation}
                language={r.languageName}
                form={r.form}
              />
            ))}
          </div>
        )}

        {recentChanges.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="grammar-section-label" style={{ marginBottom: 6 }}>
              Recent sound changes in {lang.name}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {recentChanges.map((e, i) => (
                <div
                  key={i}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 1fr",
                    gap: 8,
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--fs-1)",
                    color: "var(--muted)",
                  }}
                >
                  <span>g{e.generation}</span>
                  <span style={{ color: "var(--text)" }}>{e.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({
  generation,
  language,
  form,
  accent,
}: {
  generation: number;
  language: string;
  form: string;
  accent?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "60px 1fr 1fr",
        gap: 8,
        padding: "4px 6px",
        background: accent ? "var(--accent-soft)" : "var(--panel-2)",
        borderRadius: "var(--r-1)",
        alignItems: "baseline",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--fs-2)",
      }}
    >
      <span style={{ color: "var(--muted)" }}>g{generation}</span>
      <span>{language}</span>
      <span style={{ color: "var(--accent)" }}>{form}</span>
    </div>
  );
}
