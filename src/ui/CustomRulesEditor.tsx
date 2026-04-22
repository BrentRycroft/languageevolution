import { useState } from "react";
import { useSimStore } from "../state/store";
import { parseRuleDsl } from "../engine/phonology/dsl";

/**
 * Form-based editor for user-defined sound-change rules. Rules are stored
 * on the config and applied to the proto language at seed time; daughters
 * inherit them. Changes trigger a simulation reset (the config change is
 * plumbed through `updateConfig`).
 */
export function CustomRulesEditor() {
  const rules = useSimStore((s) => s.config.customRules ?? []);
  const setCustomRules = useSimStore((s) => s.setCustomRules);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    const parsed = parseRuleDsl(text);
    if (typeof parsed === "string") {
      setError(parsed);
      return;
    }
    setError(null);
    setCustomRules([...rules, text]);
    setDraft("");
  };

  const remove = (i: number) => {
    const next = rules.slice();
    next.splice(i, 1);
    setCustomRules(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--fs-2)" }}>
      <div style={{ color: "var(--muted)", fontSize: "var(--fs-1)" }}>
        Syntax: <code className="mono">p → f</code>, <code className="mono">k → h / _V</code>,
        <code className="mono"> s → z / V_V</code>, <code className="mono">V → # / _#</code> (delete).
        Metachars: <code className="mono">V</code>, <code className="mono">C</code>, <code className="mono">#</code>,
        <code className="mono">_</code>.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4 }}>
        <input
          type="text"
          placeholder='e.g. "p -> f / _V"'
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          aria-label="Custom sound-change rule"
        />
        <button className="primary" onClick={add}>
          Add
        </button>
      </div>
      {error && (
        <div style={{ color: "var(--danger)", fontSize: "var(--fs-1)" }}>{error}</div>
      )}
      {rules.length === 0 ? (
        <div style={{ color: "var(--muted)", fontSize: "var(--fs-1)" }}>No custom rules yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rules.map((r, i) => {
            const parsed = parseRuleDsl(r);
            const ok = typeof parsed !== "string";
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 4,
                  alignItems: "center",
                  padding: "3px 6px",
                  background: "var(--panel-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r-1)",
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-1)",
                  color: ok ? "var(--text)" : "var(--danger)",
                }}
                title={ok ? (parsed as { label: string }).label : (parsed as string)}
              >
                <span>{r}</span>
                <button className="ghost" onClick={() => remove(i)} aria-label="Remove rule">
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
