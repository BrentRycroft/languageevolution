/**
 * Phase 50 T2: shared "no data" placeholder used across language-
 * dependent views (StatsPanel, Translator, GrammarView, etc.) so the
 * empty-state experience is uniform — same typography, same hint
 * structure, same "Select a language from the tree" guidance.
 */
import type { ReactNode } from "react";

export interface EmptyStateProps {
  title: string;
  hint?: ReactNode;
  icon?: string;
}

export function EmptyState({ title, hint, icon }: EmptyStateProps) {
  return (
    <div
      role="status"
      style={{
        padding: "24px 16px",
        color: "var(--muted)",
        fontSize: 13,
        textAlign: "center",
        border: "1px dashed var(--border)",
        borderRadius: 6,
        margin: "12px 0",
        background: "var(--bg-soft, transparent)",
      }}
    >
      {icon && <div style={{ fontSize: 24, marginBottom: 8 }} aria-hidden>{icon}</div>}
      <div style={{ fontWeight: 500, marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 11, opacity: 0.85 }}>{hint}</div>}
    </div>
  );
}
