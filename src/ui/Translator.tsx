import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import {
  translate,
  translateBetween,
  translateWithAI,
  type TranslationResult,
} from "../engine/translator/translate";
import { findCognates, traceEtymology } from "../engine/translator/cognates";
import type { MorphCategory } from "../engine/morphology/types";

type Mode = "en-to-lang" | "lang-to-lang" | "cognates" | "etymology";

export function Translator() {
  const state = useSimStore((s) => s.state);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);

  const [mode, setMode] = useState<Mode>("en-to-lang");
  const [langId, setLangId] = useState<string>(alive[0] ?? "");
  const [langIdB, setLangIdB] = useState<string>(alive[1] ?? alive[0] ?? "");
  const [word, setWord] = useState("");
  const [category, setCategory] = useState<MorphCategory | "">("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const lang = langId ? state.tree[langId]?.language : undefined;
  const langB = langIdB ? state.tree[langIdB]?.language : undefined;
  const paradigmCats = lang
    ? (Object.keys(lang.morphology.paradigms) as MorphCategory[])
    : [];

  const run = () => {
    if (!lang || !word.trim()) return;
    if (mode === "lang-to-lang" && langB) {
      setResult(translateBetween(lang, langB, word.trim()));
      return;
    }
    const opts = category ? { inflect: category } : {};
    setResult(translate(lang, word, opts));
    setAiError(null);
  };

  const runAI = async () => {
    if (!lang || !word.trim()) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const r = await translateWithAI(lang, word);
      setResult(r);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div style={{ fontSize: 13, maxWidth: 720 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
        {(["en-to-lang", "lang-to-lang", "cognates", "etymology"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "primary" : ""}
            onClick={() => {
              setMode(m);
              setResult(null);
            }}
          >
            {label(m)}
          </button>
        ))}
      </div>

      {(mode === "en-to-lang" || mode === "lang-to-lang" || mode === "etymology") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <select
            aria-label="Source language"
            value={langId}
            onChange={(e) => {
              setLangId(e.target.value);
              setResult(null);
            }}
          >
            {alive.map((id) => (
              <option key={id} value={id}>
                {state.tree[id]!.language.name}
              </option>
            ))}
          </select>
          {mode === "lang-to-lang" ? (
            <select
              aria-label="Target language"
              value={langIdB}
              onChange={(e) => setLangIdB(e.target.value)}
            >
              {alive.map((id) => (
                <option key={id} value={id}>
                  {state.tree[id]!.language.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              placeholder={mode === "etymology" ? "meaning (e.g. water)" : "English word"}
              value={word}
              onChange={(e) => setWord(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              aria-label="Input word"
            />
          )}
        </div>
      )}

      {mode === "lang-to-lang" && (
        <div style={{ marginTop: 8 }}>
          <input
            type="text"
            placeholder="form in source language (e.g. vaθar)"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Source form"
            style={{ width: "100%" }}
          />
        </div>
      )}

      {mode === "cognates" && (
        <input
          type="text"
          placeholder="meaning (e.g. water)"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          aria-label="Meaning for cognate lookup"
          style={{ width: "100%" }}
        />
      )}

      {mode === "en-to-lang" && paradigmCats.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", marginRight: 6 }}>
            Inflect as:
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MorphCategory | "")}
            aria-label="Morphology category"
          >
            <option value="">(bare form)</option>
            {paradigmCats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}

      {(mode === "en-to-lang" || mode === "lang-to-lang") && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="primary" onClick={run}>
            Translate
          </button>
          {mode === "en-to-lang" && (
            <button onClick={runAI} disabled={aiBusy}>
              {aiBusy ? "Loading AI…" : "Try with AI"}
            </button>
          )}
        </div>
      )}

      {aiError && (
        <div style={{ color: "var(--danger)", marginTop: 6, fontSize: 11 }}>{aiError}</div>
      )}

      {result && (mode === "en-to-lang" || mode === "lang-to-lang") && (
        <div
          style={{
            marginTop: 12,
            padding: 10,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontFamily: "'SF Mono', Menlo, monospace",
              color: "var(--accent)",
            }}
          >
            {result.form}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            source: {result.source} — {result.notes}
          </div>
        </div>
      )}

      {mode === "cognates" && word.trim() && (
        <CognatesTable meaning={word.trim().toLowerCase()} tree={state.tree} />
      )}

      {mode === "etymology" && lang && word.trim() && (
        <EtymologyTrace leafId={lang.id} meaning={word.trim().toLowerCase()} />
      )}
    </div>
  );
}

function label(m: Mode): string {
  if (m === "en-to-lang") return "English → Language";
  if (m === "lang-to-lang") return "Language → Language";
  if (m === "cognates") return "Cognates";
  return "Etymology";
}

function CognatesTable({ meaning, tree }: { meaning: string; tree: import("../engine/types").LanguageTree }) {
  const rows = useMemo(() => findCognates(tree, meaning), [tree, meaning]);
  return (
    <table
      style={{
        width: "100%",
        marginTop: 12,
        borderCollapse: "collapse",
        fontFamily: "'SF Mono', Menlo, monospace",
        fontSize: 12,
      }}
    >
      <thead>
        <tr style={{ color: "var(--muted)" }}>
          <th style={{ textAlign: "left", padding: "4px 6px" }}>language</th>
          <th style={{ textAlign: "left", padding: "4px 6px" }}>form</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.languageId} style={{ opacity: r.extinct ? 0.5 : 1 }}>
            <td style={{ padding: "3px 6px" }}>
              {r.languageName}
              {r.extinct && <span style={{ marginLeft: 4, color: "var(--danger)" }}>×</span>}
            </td>
            <td style={{ padding: "3px 6px", color: "var(--accent)" }}>{r.form}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EtymologyTrace({ leafId, meaning }: { leafId: string; meaning: string }) {
  const state = useSimStore((s) => s.state);
  const steps = useMemo(() => traceEtymology(state.tree, leafId, meaning), [state.tree, leafId, meaning]);
  return (
    <div
      style={{
        marginTop: 12,
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {steps.map((s, i) => (
        <div key={s.languageId} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              padding: "4px 8px",
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontFamily: "'SF Mono', Menlo, monospace",
              fontSize: 12,
            }}
          >
            <div style={{ fontSize: 10, color: "var(--muted)" }}>
              {s.languageName} @ g{s.generation}
            </div>
            <div style={{ color: "var(--accent)" }}>{s.form}</div>
          </div>
          {i < steps.length - 1 && <span style={{ color: "var(--muted)" }}>→</span>}
        </div>
      ))}
    </div>
  );
}
