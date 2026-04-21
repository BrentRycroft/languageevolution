import { useEffect } from "react";
import { useSimStore } from "../state/store";

export function AiSemantics() {
  const aiStatus = useSimStore((s) => s.aiStatus);
  const aiNeighbors = useSimStore((s) => s.aiNeighbors);
  const enable = useSimStore((s) => s.enableAiNeighbors);
  const clear = useSimStore((s) => s.clearAiNeighbors);
  const loadCached = useSimStore((s) => s.loadCachedAiNeighbors);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  const count = Object.keys(aiNeighbors).length;
  const inProgress =
    !aiStatus.ready && aiStatus.progress > 0 && !aiStatus.error;

  return (
    <div style={{ fontSize: 11, display: "grid", gap: 6 }}>
      <div style={{ color: "var(--muted)" }}>
        Opt-in: download a small in-browser LLM (Gemma 2 2B) to generate
        semantic neighbors for your lexicon. Runs entirely client-side; cached
        in IndexedDB after the first download (~1–2 GB).
      </div>
      {count > 0 && (
        <div style={{ color: "var(--ok)" }}>
          {count} meanings have AI-generated neighbors.
        </div>
      )}
      {aiStatus.error && (
        <div style={{ color: "var(--danger)", fontFamily: "'SF Mono', Menlo, monospace" }}>
          {aiStatus.error}
        </div>
      )}
      {inProgress && (
        <div>
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
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        <button onClick={enable} disabled={inProgress}>
          {count > 0 ? "Regenerate" : "Enable AI drift"}
        </button>
        {count > 0 && <button onClick={clear}>Clear AI cache</button>}
      </div>
    </div>
  );
}
