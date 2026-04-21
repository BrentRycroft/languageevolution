import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { translate, translateWithAI, type TranslationResult } from "../engine/translator/translate";
import type { MorphCategory } from "../engine/morphology/types";

export function Translator() {
  const state = useSimStore((s) => s.state);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);
  const [langId, setLangId] = useState<string>(alive[0] ?? "");
  const [word, setWord] = useState("");
  const [category, setCategory] = useState<MorphCategory | "">("");
  const [result, setResult] = useState<TranslationResult | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const lang = langId ? state.tree[langId]?.language : undefined;
  const paradigmCats = lang
    ? (Object.keys(lang.morphology.paradigms) as MorphCategory[])
    : [];

  const run = () => {
    if (!lang || !word.trim()) return;
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
    <div style={{ fontSize: 13, maxWidth: 600 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <select
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
        <input
          type="text"
          placeholder="English word"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
        />
      </div>
      {paradigmCats.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", marginRight: 6 }}>
            Inflect as:
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as MorphCategory | "")}
          >
            <option value="">(bare form)</option>
            {paradigmCats.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <button className="primary" onClick={run}>Translate</button>
        <button onClick={runAI} disabled={aiBusy}>
          {aiBusy ? "Loading AI…" : "Try with AI"}
        </button>
      </div>
      {aiError && (
        <div style={{ color: "var(--danger)", marginTop: 6, fontSize: 11 }}>{aiError}</div>
      )}
      {result && (
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
    </div>
  );
}
