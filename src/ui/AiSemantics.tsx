import { useEffect, useState } from "react";
import { useSimStore } from "../state/store";
import { generateGrammarSketch } from "../engine/translator/grammarSketch";
import { suggestRuleBias } from "../engine/translator/ruleBias";

/**
 * Consolidated AI panel. Shows model status, lets users:
 *  - enable / regenerate / clear the semantic-neighbor cache
 *  - generate a prose grammar sketch for the selected language
 *  - suggest a rule-bias vector from a natural-language intent
 * All three share the Ministral 3B WebLLM engine.
 */
export function AiSemantics() {
  const aiStatus = useSimStore((s) => s.aiStatus);
  const aiNeighbors = useSimStore((s) => s.aiNeighbors);
  const enable = useSimStore((s) => s.enableAiNeighbors);
  const clear = useSimStore((s) => s.clearAiNeighbors);
  const loadCached = useSimStore((s) => s.loadCachedAiNeighbors);
  const selectedLangId = useSimStore((s) => s.selectedLangId);
  const state = useSimStore((s) => s.state);
  const applyBias = useSimStore((s) => s.applyRuleBiasToLanguage);

  const [sketch, setSketch] = useState<string>("");
  const [sketchBusy, setSketchBusy] = useState(false);
  const [biasIntent, setBiasIntent] = useState("");
  const [biasBusy, setBiasBusy] = useState(false);
  const [biasLog, setBiasLog] = useState<string>("");
  const [gatingWarning, setGatingWarning] = useState<string | null>(null);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  // Offline / WebGPU gating: run once on mount.
  useEffect(() => {
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    const noGpu =
      typeof navigator !== "undefined" &&
      !(navigator as unknown as { gpu?: unknown }).gpu;
    if (offline) {
      setGatingWarning("Offline — AI features require the first model download over the network.");
    } else if (noGpu) {
      setGatingWarning("WebGPU unavailable in this browser — AI features will fall back to slower WASM execution if supported, or fail.");
    }
  }, []);

  const count = Object.keys(aiNeighbors).length;
  const inProgress = !aiStatus.ready && aiStatus.progress > 0 && !aiStatus.error;
  const lang = selectedLangId ? state.tree[selectedLangId]?.language : undefined;

  const runSketch = async () => {
    if (!lang) return;
    setSketchBusy(true);
    setSketch("");
    try {
      const s = await generateGrammarSketch(lang);
      setSketch(s);
    } catch (e) {
      setSketch(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSketchBusy(false);
    }
  };

  const runBias = async () => {
    if (!lang || !biasIntent.trim()) return;
    setBiasBusy(true);
    setBiasLog("");
    try {
      const result = await suggestRuleBias(biasIntent);
      if (!result) {
        setBiasLog("Model returned unparseable output — try rephrasing the intent.");
        return;
      }
      applyBias(lang.id, result.bias);
      const summary = Object.entries(result.bias)
        .filter(([, v]) => Math.abs(v - 1) > 0.05)
        .map(([k, v]) => `${k} ×${v.toFixed(2)}`)
        .join(", ");
      setBiasLog(
        `Applied bias to ${lang.name}: ${summary || "(no significant shifts)"}. A rule is being proposed now; the bias will also shape every future proposal cycle.`,
      );
    } catch (e) {
      setBiasLog(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBiasBusy(false);
    }
  };

  return (
    <div style={{ fontSize: "var(--fs-1)", display: "grid", gap: 12 }}>
      {gatingWarning && (
        <div
          style={{
            padding: "6px 10px",
            borderRadius: 4,
            background: "var(--panel-2)",
            border: "1px solid #ffcc66",
            color: "#ffcc66",
            fontSize: "var(--fs-1)",
          }}
        >
          {gatingWarning}
        </div>
      )}

      <section>
        <h5 style={{ margin: "0 0 4px", color: "var(--muted)" }}>
          Model {aiStatus.ready && <span style={{ color: "#7be07b" }}>· ready</span>}
        </h5>
        <div style={{ color: "var(--muted)", marginBottom: 6 }}>
          Uses <strong>Ministral 3B Instruct</strong> via WebLLM. First load
          caches ~1.9 GB in IndexedDB. All inference is client-side; the
          simulator itself stays deterministic.
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button
            onClick={() => useSimStore.getState().downloadAiModel()}
            disabled={inProgress || aiStatus.ready}
            className={aiStatus.ready ? "" : "primary"}
          >
            {aiStatus.ready ? "Model ready ✓" : inProgress ? "Downloading…" : "Download model"}
          </button>
          {aiStatus.ready && <button onClick={clear}>Clear model cache</button>}
        </div>
        {aiStatus.error && (
          <div style={{ color: "#ff6a7a", fontFamily: "var(--font-mono)", marginTop: 4 }}>
            {aiStatus.error}
          </div>
        )}
        {inProgress && (
          <div style={{ marginTop: 4 }}>
            <div style={{ color: "var(--muted)" }}>{aiStatus.text}</div>
            <div
              style={{
                height: 6,
                background: "var(--panel-2)",
                borderRadius: 3,
                overflow: "hidden",
                marginTop: 4,
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.round(aiStatus.progress * 100)}%`,
                  background: "var(--accent)",
                  transition: "width 0.2s",
                }}
              />
            </div>
          </div>
        )}
      </section>

      <section>
        <h5 style={{ margin: "0 0 4px", color: "var(--muted)" }}>
          Semantic neighbors ({count})
        </h5>
        <div style={{ color: "var(--muted)", marginBottom: 4 }}>
          Pre-fill AI-generated neighbors for every seed meaning; the drift
          engine uses them as semantic-shift targets.
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          <button onClick={enable} disabled={inProgress}>
            {count > 0 ? "Regenerate" : "Enable AI drift"}
          </button>
          {count > 0 && <button onClick={clear}>Clear cache</button>}
        </div>
      </section>

      <section>
        <h5 style={{ margin: "0 0 4px", color: "var(--muted)" }}>
          Grammar sketch {lang ? `· ${lang.name}` : ""}
        </h5>
        <div style={{ color: "var(--muted)", marginBottom: 4 }}>
          Prose description of the selected language based on its active
          rules, inventory, and grammar features.
        </div>
        <button onClick={runSketch} disabled={!lang || sketchBusy}>
          {sketchBusy ? "Writing…" : "Generate sketch"}
        </button>
        {sketch && (
          <div
            style={{
              marginTop: 8,
              padding: 8,
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              fontSize: "var(--fs-2)",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
            }}
          >
            {sketch}
          </div>
        )}
      </section>

      <section>
        <h5 style={{ margin: "0 0 4px", color: "var(--muted)" }}>
          Rule-bias suggester {lang ? `· ${lang.name}` : ""}
        </h5>
        <div style={{ color: "var(--muted)", marginBottom: 4 }}>
          Describe a stylistic goal; the model returns a family-bias vector
          that shapes which sound laws this language invents next.
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <input
            type="text"
            value={biasIntent}
            onChange={(e) => setBiasIntent(e.target.value)}
            placeholder='e.g. "sound more Germanic"'
            aria-label="Bias intent"
            style={{ flex: 1 }}
          />
          <button onClick={runBias} disabled={!lang || biasBusy || !biasIntent.trim()}>
            {biasBusy ? "Tuning…" : "Apply"}
          </button>
        </div>
        {biasLog && (
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: "var(--fs-1)" }}>
            {biasLog}
          </div>
        )}
      </section>
    </div>
  );
}
