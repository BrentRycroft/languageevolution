import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { generateNarrative } from "../engine/narrative/generate";
import { ScriptPicker } from "./ScriptPicker";

export function NarrativeView() {
  const state = useSimStore((s) => s.state);
  const script = useSimStore((s) => s.displayScript);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);
  const [langId, setLangId] = useState<string>(alive[0] ?? leaves[0] ?? "");
  const [seed, setSeed] = useState<string>("tale");
  const [lineCount, setLineCount] = useState(6);

  const lang = langId ? state.tree[langId]?.language : undefined;
  const narrative = useMemo(() => {
    if (!lang) return [];
    return generateNarrative(lang, seed, lineCount, script);
  }, [lang, seed, lineCount, script, state.generation]);

  return (
    <div style={{ fontSize: "var(--fs-2)", maxWidth: 720 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 8, alignItems: "center" }}>
        <select
          aria-label="Language for narrative"
          value={langId}
          onChange={(e) => setLangId(e.target.value)}
        >
          {leaves.map((id) => (
            <option key={id} value={id}>
              {state.tree[id]!.language.name}
              {state.tree[id]!.language.extinct ? " ×" : ""}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          placeholder="narrative seed"
          aria-label="Narrative seed"
          style={{ fontFamily: "var(--font-mono)" }}
        />
        <select
          value={lineCount}
          onChange={(e) => setLineCount(parseInt(e.target.value, 10))}
          aria-label="Number of lines"
        >
          {[3, 5, 6, 8, 10].map((n) => (
            <option key={n} value={n}>{n} lines</option>
          ))}
        </select>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <ScriptPicker />
      </div>

      {!lang ? (
        <div style={{ color: "var(--muted)", padding: 12 }}>Pick a language to generate a text.</div>
      ) : narrative.length === 0 ? (
        <div style={{ color: "var(--muted)", padding: 12 }}>
          Not enough vocabulary in {lang.name} to compose a sentence yet.
        </div>
      ) : (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-2)",
          }}
        >
          <div
            style={{
              fontSize: "var(--fs-1)",
              color: "var(--muted)",
              fontFamily: "var(--font-mono)",
              marginBottom: 8,
            }}
          >
            {lang.name} · word order {lang.grammar.wordOrder} · {Object.keys(lang.morphology.paradigms).length} paradigms
          </div>
          {narrative.map((line, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent)",
                  fontSize: "var(--fs-3)",
                }}
              >
                {line.text}
              </div>
              <div
                style={{
                  fontSize: "var(--fs-1)",
                  color: "var(--muted)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {line.gloss}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: "var(--fs-1)", color: "var(--muted)", marginTop: 10 }}>
        Sentences are deterministic given the seed — change the seed to get a different short text.
      </div>
    </div>
  );
}
