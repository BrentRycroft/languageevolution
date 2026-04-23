import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import {
  translate,
  translateBetween,
  translateWithAI,
  translateSentenceWithAI,
  type SentenceTranslation,
  type TranslationResult,
} from "../engine/translator/translate";
import { findCognates, traceEtymology } from "../engine/translator/cognates";
import { formatForm } from "../engine/phonology/display";
import type { MorphCategory } from "../engine/morphology/types";
import { ScriptPicker } from "./ScriptPicker";

type Mode = "en-to-lang" | "lang-to-lang" | "ai-sentence" | "cognates" | "etymology";

export function Translator() {
  const state = useSimStore((s) => s.state);
  const script = useSimStore((s) => s.displayScript);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);

  const [mode, setMode] = useState<Mode>("en-to-lang");
  const [langId, setLangId] = useState<string>(alive[0] ?? "");
  const [langIdB, setLangIdB] = useState<string>(alive[1] ?? alive[0] ?? "");
  const [word, setWord] = useState("");
  const [category, setCategory] = useState<MorphCategory | "">("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [sentenceResult, setSentenceResult] = useState<SentenceTranslation | null>(null);
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

  const runSentenceAI = async () => {
    if (!lang || !word.trim()) return;
    setAiBusy(true);
    setAiError(null);
    setSentenceResult(null);
    try {
      const r = await translateSentenceWithAI(lang, word);
      setSentenceResult(r);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div style={{ fontSize: 13, maxWidth: 720 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
        {(["en-to-lang", "ai-sentence", "lang-to-lang", "cognates", "etymology"] as const).map((m) => (
          <button
            key={m}
            className={mode === m ? "primary" : ""}
            onClick={() => {
              setMode(m);
              setResult(null);
              setSentenceResult(null);
              setAiError(null);
            }}
          >
            {label(m)}
          </button>
        ))}
        <span style={{ marginLeft: "auto" }}>
          <ScriptPicker />
        </span>
      </div>

      {(mode === "en-to-lang" || mode === "lang-to-lang" || mode === "etymology" || mode === "ai-sentence") && (
        <div style={{ display: "grid", gridTemplateColumns: mode === "ai-sentence" ? "1fr" : "1fr 1fr", gap: 8 }}>
          <select
            aria-label="Source language"
            value={langId}
            onChange={(e) => {
              setLangId(e.target.value);
              setResult(null);
              setSentenceResult(null);
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
          ) : mode === "ai-sentence" ? null : (
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

      {mode === "ai-sentence" && (
        <div style={{ marginTop: 8 }}>
          <textarea
            placeholder="Enter an English sentence (e.g. The dog sees the mother by the water)."
            value={word}
            onChange={(e) => setWord(e.target.value)}
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
          <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
            <button className="primary" onClick={runSentenceAI} disabled={aiBusy}>
              {aiBusy ? "Translating…" : "Translate sentence"}
            </button>
            <span style={{ color: "var(--muted)", fontSize: "var(--fs-1)" }}>
              Uses the on-device LLM. First run downloads the model (~1.9 GB).
            </span>
          </div>
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

      {mode === "ai-sentence" && sentenceResult && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: "var(--fs-3)",
              fontFamily: "var(--font-mono)",
              color: "var(--accent)",
              marginBottom: 6,
            }}
          >
            {sentenceResult.target || "—"}
          </div>
          {sentenceResult.tokens.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                padding: "6px 0",
                borderTop: "1px dashed var(--border)",
              }}
            >
              {sentenceResult.tokens.map((t, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  <span style={{ fontSize: "var(--fs-2)", color: "var(--text)" }}>{t.form}</span>
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>{t.gloss}</span>
                </div>
              ))}
            </div>
          )}
          {sentenceResult.missing.length > 0 && (
            <div style={{ fontSize: "var(--fs-1)", color: "#ffcc66", marginTop: 4 }}>
              Missing: {sentenceResult.missing.join(", ")}
            </div>
          )}
          {sentenceResult.notes && (
            <div style={{ fontSize: "var(--fs-1)", color: "var(--muted)", marginTop: 4 }}>
              {sentenceResult.notes}
            </div>
          )}
        </div>
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
            {mode === "lang-to-lang" && langB
              ? result.phonemes.length > 0
                ? formatForm(result.phonemes, langB, script)
                : result.form
              : lang && result.phonemes.length > 0
                ? formatForm(result.phonemes, lang, script)
                : result.form}
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
  if (m === "ai-sentence") return "AI sentence";
  if (m === "lang-to-lang") return "Language → Language";
  if (m === "cognates") return "Cognates";
  return "Etymology";
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
            <div style={{ color: "var(--accent)" }}>{s.form}</div>
          </div>
          {i < steps.length - 1 && <span style={{ color: "var(--muted)" }}>→</span>}
        </div>
      ))}
    </div>
  );
}
