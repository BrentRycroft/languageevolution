import { useEffect, useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import {
  translate,
  translateBetween,
  type TranslationResult,
} from "../engine/translator/translate";
import { translateSentence, type SentenceTranslation } from "../engine/translator/sentence";
import { findCognates, traceEtymology } from "../engine/translator/cognates";
import { formatForm } from "../engine/phonology/display";
import type { MorphCategory } from "../engine/morphology/types";
import { ScriptPicker } from "./ScriptPicker";

type Mode = "sentence" | "word" | "lang-to-lang" | "cognates" | "etymology";

export function Translator() {
  const state = useSimStore((s) => s.state);
  const script = useSimStore((s) => s.displayScript);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = useMemo(
    () => leaves.filter((id) => !state.tree[id]!.language.extinct),
    [leaves, state.tree],
  );

  const [mode, setMode] = useState<Mode>("sentence");
  const [langId, setLangId] = useState<string>(alive[0] ?? "");
  const [langIdB, setLangIdB] = useState<string>(alive[1] ?? alive[0] ?? "");
  const [text, setText] = useState("");
  const [category, setCategory] = useState<MorphCategory | "">("");
  const [wordResult, setWordResult] = useState<TranslationResult | null>(null);
  const [sentenceResult, setSentenceResult] = useState<SentenceTranslation | null>(null);

  useEffect(() => {
    if (alive.length === 0) return;
    if (!alive.includes(langId)) setLangId(alive[0]!);
  }, [alive, langId]);

  useEffect(() => {
    if (alive.length === 0) return;
    if (!alive.includes(langIdB)) {
      setLangIdB(alive.find((id) => id !== langId) ?? alive[0]!);
    }
  }, [alive, langId, langIdB]);

  const lang = langId ? state.tree[langId]?.language : undefined;
  const langB = langIdB ? state.tree[langIdB]?.language : undefined;
  const paradigmCats = lang
    ? (Object.keys(lang.morphology.paradigms) as MorphCategory[])
    : [];

  const run = () => {
    if (!lang || !text.trim()) return;
    setSentenceResult(null);
    setWordResult(null);
    if (mode === "sentence") {
      setSentenceResult(translateSentence(lang, text.trim()));
      return;
    }
    if (mode === "lang-to-lang" && langB) {
      setWordResult(translateBetween(lang, langB, text.trim()));
      return;
    }
    if (mode === "word") {
      const opts = category ? { inflect: category } : {};
      setWordResult(translate(lang, text, opts));
    }
  };

  return (
    <div style={{ fontSize: 13, maxWidth: 760 }}>
      <div className="toolbar">
        {(["sentence", "word", "lang-to-lang", "cognates", "etymology"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "primary" : ""}
            onClick={() => {
              setMode(m);
              setWordResult(null);
              setSentenceResult(null);
            }}
          >
            {label(m)}
          </button>
        ))}
        <span className="ml-auto">
          <ScriptPicker />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: mode === "sentence" ? "1fr" : "1fr 1fr", gap: 8 }}>
        <select
          aria-label="Source language"
          value={langId}
          onChange={(e) => {
            setLangId(e.target.value);
            setWordResult(null);
            setSentenceResult(null);
          }}
        >
          {alive.map((id) => (
            <option key={id} value={id}>
              {state.tree[id]!.language.name}
            </option>
          ))}
        </select>
        {mode === "lang-to-lang" && (
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
        )}
        {(mode === "word" || mode === "etymology" || mode === "cognates") && (
          <input
            type="text"
            placeholder={
              mode === "etymology" || mode === "cognates"
                ? "meaning (e.g. water)"
                : "English word"
            }
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Input"
          />
        )}
      </div>

      {mode === "sentence" && (
        <div className="mt-8">
          <textarea
            placeholder="Enter an English sentence (e.g. The dog sees the mother by the water)."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            aria-label="English sentence"
            style={{
              width: "100%",
              fontFamily: "inherit",
              fontSize: "var(--fs-2)",
              padding: 8,
              background: "var(--panel-2)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              resize: "vertical",
            }}
          />
        </div>
      )}

      {mode === "lang-to-lang" && (
        <div className="mt-8">
          <input
            type="text"
            placeholder="form in source language (e.g. vaθar)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            aria-label="Source form"
            style={{ width: "100%" }}
          />
        </div>
      )}

      {mode === "word" && paradigmCats.length > 0 && (
        <div className="mt-6">
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

      {(mode === "sentence" || mode === "word" || mode === "lang-to-lang") && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          <button className="primary" onClick={run}>
            Translate
          </button>
        </div>
      )}

      {mode === "sentence" && sentenceResult && lang && (
        <SentenceOutput result={sentenceResult} lang={lang} script={script} />
      )}

      {wordResult && (mode === "word" || mode === "lang-to-lang") && (
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
            {mode === "lang-to-lang" && langB
              ? wordResult.phonemes.length > 0
                ? formatForm(wordResult.phonemes, langB, script, text.trim().toLowerCase())
                : wordResult.form
              : lang && wordResult.phonemes.length > 0
                ? formatForm(wordResult.phonemes, lang, script, text.trim().toLowerCase())
                : wordResult.form}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
            source: {wordResult.source} — {wordResult.notes}
          </div>
        </div>
      )}

      {mode === "cognates" && text.trim() && (
        <CognatesTable meaning={text.trim().toLowerCase()} tree={state.tree} />
      )}

      {mode === "etymology" && lang && text.trim() && (
        <EtymologyTrace leafId={lang.id} meaning={text.trim().toLowerCase()} />
      )}
    </div>
  );
}

function SentenceOutput({
  result,
  lang,
  script,
}: {
  result: SentenceTranslation;
  lang: import("../engine/types").Language;
  script: import("../engine/phonology/display").DisplayScript;
}) {
  return (
    <div
      style={{
        marginTop: 12,
        padding: 12,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 6,
      }}
    >
      {}
      <div
        style={{
          fontSize: "var(--fs-3)",
          fontFamily: "var(--font-mono)",
          color: "var(--accent)",
          marginBottom: 6,
        }}
      >
        {result.targetTokens.length === 0
          ? "—"
          : result.arranged
              .map((_, i) => {
                const tok = result.targetTokens[i]!;
                if (tok.targetForm.length === 0) return tok.targetSurface;
                return formatForm(tok.targetForm, lang, script, tok.englishLemma);
              })
              .join(" ")}
      </div>
      {}
      <div
        className="token-row"
      >
        {result.targetTokens.map((t, i) => (
          <div
            key={`${t.englishLemma}-${t.englishTag}-${i}`}
            className="token-card"
            title={`${t.englishLemma} (${t.englishTag})${t.glossNote ? " · " + t.glossNote : ""} · ${t.resolution}`}
          >
            <span className="token-form">
              {t.targetForm.length > 0 ? formatForm(t.targetForm, lang, script, t.englishLemma) : t.targetSurface}
            </span>
            <span className="token-gloss">
              {t.englishLemma}
              {t.glossNote && <> · {t.glossNote}</>}
            </span>
          </div>
        ))}
      </div>
      {result.missing.length > 0 && (
        <div className="footer-note warn">
          Unresolved: {result.missing.join(", ")}
        </div>
      )}
      <div className="footer-note">
        {result.notes}
      </div>
    </div>
  );
}

function label(m: Mode): string {
  switch (m) {
    case "sentence": return "English → Language";
    case "word": return "Single word";
    case "lang-to-lang": return "Language → Language";
    case "cognates": return "Cognates";
    case "etymology": return "Etymology";
  }
}

function CognatesTable({ meaning, tree }: { meaning: string; tree: import("../engine/types").LanguageTree }) {
  const script = useSimStore((s) => s.displayScript);
  const rows = useMemo(
    () => findCognates(tree, meaning, script),
    [tree, meaning, script],
  );
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
        <tr className="t-muted">
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
  const script = useSimStore((s) => s.displayScript);
  const steps = useMemo(
    () => traceEtymology(state.tree, leafId, meaning, script),
    [state.tree, leafId, meaning, script],
  );
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
            <div className="t-accent">{s.form}</div>
          </div>
          {i < steps.length - 1 && <span className="t-muted">→</span>}
        </div>
      ))}
    </div>
  );
}
