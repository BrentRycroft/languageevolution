import { useSimStore } from "../state/store";

/**
 * Compact three-way picker for the global display script (IPA / Aa / both).
 * Reads and writes the `displayScript` setting on the shared store — so
 * flipping it in any view affects every view that formats phonetic forms.
 */
export function ScriptPicker({
  compact = true,
}: {
  compact?: boolean;
}) {
  const script = useSimStore((s) => s.displayScript);
  const setScript = useSimStore((s) => s.setDisplayScript);
  return (
    <div
      style={{ display: "inline-flex", gap: 2 }}
      role="group"
      aria-label="Display script"
    >
      {(["ipa", "roman", "both"] as const).map((s) => (
        <button
          key={s}
          type="button"
          className={script === s ? "primary" : "ghost"}
          onClick={() => setScript(s)}
          style={{
            minHeight: compact ? 24 : 28,
            padding: compact ? "2px 8px" : "4px 10px",
            fontSize: "var(--fs-1)",
            borderRadius: "var(--r-pill)",
          }}
          title={
            s === "ipa"
              ? "Phonemic IPA (/wator/)"
              : s === "roman"
                ? "Orthographic romanization (Aa)"
                : "Both side by side"
          }
          aria-pressed={script === s}
        >
          {s === "ipa" ? "IPA" : s === "roman" ? "Aa" : "both"}
        </button>
      ))}
    </div>
  );
}
