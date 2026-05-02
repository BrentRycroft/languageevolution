import { useId } from "react";

interface ListSearchProps {
  /** Current query value (controlled). */
  value: string;
  /** Called when the user changes the query. */
  onChange: (next: string) => void;
  /** Placeholder text. Defaults to "Filter…". */
  placeholder?: string;
  /** Optional aria-label. Defaults to placeholder. */
  label?: string;
  /** Optional inline style for the wrapper. */
  style?: React.CSSProperties;
  /** Optional className for the wrapper. */
  className?: string;
  /**
   * Optional secondary count to show next to the input
   * (e.g. "12 / 200" matches when filtering active and retired rules).
   */
  countLabel?: string;
}

/**
 * Small reusable filter input for in-tab list filtering. No debounce — the
 * caller decides how to consume the value (typically via useMemo).
 *
 * Designed to be lightweight: no native search-icon, no clear-X button,
 * just a tight input with `aria-label`. Components keep their own state for
 * the query so independent filters don't share text.
 */
export function ListSearch({
  value,
  onChange,
  placeholder = "Filter…",
  label,
  style,
  className,
  countLabel,
}: ListSearchProps) {
  const id = useId();
  return (
    <div
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        ...style,
      }}
      className={className}
    >
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        style={{
          flex: 1,
          padding: "3px 6px",
          fontSize: 12,
          border: "1px solid var(--border)",
          borderRadius: "var(--r-1)",
          background: "var(--panel-2)",
          color: "var(--text)",
        }}
      />
      {countLabel && (
        <span className="t-muted" style={{ fontSize: 11, fontFamily: "var(--font-mono)" }}>
          {countLabel}
        </span>
      )}
    </div>
  );
}
