import { useMemo, useState } from "react";
import { useSimStore } from "../state/store";
import { leafIds } from "../engine/tree/split";
import { generateNarrative } from "../engine/narrative/generate";
import type { DisplayScript } from "../engine/phonology/display";
import { ScriptPicker } from "./ScriptPicker";

/**
 * Generate + render a short narrative for a single language. Extracted
 * so the parent view can drop two of these side-by-side in compare
 * mode. Both columns share the same seed + line count, so the
 * structures line up and only the lexicon / morphology / word order
 * varies between them — which is the whole point of the comparison.
 */
function NarrativeColumn({
  langId,
  onChangeLangId,
  leaves,
  tree,
  seed,
  lineCount,
  script,
  generation,
  emptyHint,
}: {
  langId: string;
  onChangeLangId: (id: string) => void;
  leaves: string[];
  tree: ReturnType<typeof useSimStore.getState>["state"]["tree"];
  seed: string;
  lineCount: number;
  script: DisplayScript;
  generation: number;
  emptyHint: string;
}) {
  const lang = langId ? tree[langId]?.language : undefined;
  const narrative = useMemo(() => {
    if (!lang) return [];
    return generateNarrative(lang, seed, lineCount, script);
    // generation dep so the text re-renders each step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, seed, lineCount, script, generation]);

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <select
        aria-label="Language for narrative"
        value={langId}
        onChange={(e) => onChangeLangId(e.target.value)}
        style={{ width: "100%" }}
      >
        {leaves.map((id) => (
          <option key={id} value={id}>
            {tree[id]!.language.name}
            {tree[id]!.language.extinct ? " ×" : ""}
          </option>
        ))}
      </select>
      {!lang ? (
        <div style={{ color: "var(--muted)", padding: 12 }}>{emptyHint}</div>
      ) : narrative.length === 0 ? (
        <div style={{ color: "var(--muted)", padding: 12 }}>
          Not enough vocabulary in {lang.name} to compose a sentence yet.
        </div>
      ) : (
        <div
          style={{
            marginTop: 8,
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
    </div>
  );
}

export function NarrativeView() {
  const state = useSimStore((s) => s.state);
  const script = useSimStore((s) => s.displayScript);
  const leaves = useMemo(() => leafIds(state.tree), [state.tree]);
  const alive = leaves.filter((id) => !state.tree[id]!.language.extinct);
  const [langId, setLangId] = useState<string>(alive[0] ?? leaves[0] ?? "");
  // Second column: null = single-language view (back-compat default).
  const [langIdB, setLangIdB] = useState<string | null>(null);
  const [seed, setSeed] = useState<string>("tale");
  const [lineCount, setLineCount] = useState(6);

  const compare = langIdB !== null;

  return (
    <div style={{ fontSize: "var(--fs-2)", maxWidth: compare ? 1100 : 720 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          gap: 8,
          alignItems: "center",
        }}
      >
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
        <button
          onClick={() => {
            if (compare) {
              setLangIdB(null);
            } else {
              // When turning compare on, pick a sensible default for B:
              // the first alive leaf that isn't A, falling back to any
              // other leaf, falling back to A itself.
              const pick =
                alive.find((id) => id !== langId) ??
                leaves.find((id) => id !== langId) ??
                langId;
              setLangIdB(pick);
            }
          }}
          aria-pressed={compare}
          title="Compare two languages side by side"
        >
          {compare ? "Single view" : "Compare two"}
        </button>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <ScriptPicker />
      </div>

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <NarrativeColumn
          langId={langId}
          onChangeLangId={setLangId}
          leaves={leaves}
          tree={state.tree}
          seed={seed}
          lineCount={lineCount}
          script={script}
          generation={state.generation}
          emptyHint="Pick a language to generate a text."
        />
        {compare && langIdB !== null && (
          <NarrativeColumn
            langId={langIdB}
            onChangeLangId={setLangIdB}
            leaves={leaves}
            tree={state.tree}
            seed={seed}
            lineCount={lineCount}
            script={script}
            generation={state.generation}
            emptyHint="Pick a second language to compare."
          />
        )}
      </div>

      <div style={{ fontSize: "var(--fs-1)", color: "var(--muted)", marginTop: 10 }}>
        Sentences are deterministic given the seed — change the seed to get a
        different short text. In compare mode both columns use the same seed
        so the sentence structures align, highlighting how each language
        renders the same underlying story.
      </div>
    </div>
  );
}
