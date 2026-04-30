import { useEffect } from "react";
import { useSimStore } from "../state/store";

/**
 * Surface persistence-layer warnings as a toast — quota-exceeded,
 * future-version snapshot rejection, corrupt save, migration failure.
 * Mirrors `AchievementToast`'s shape so the same CSS picks it up.
 *
 * Auto-dismisses after 8 s (longer than the achievement toast since
 * users might be away from the screen when an autosave fails). Click
 * to dismiss sooner.
 */
export function PersistenceToast() {
  const notice = useSimStore((s) => s.persistenceNotice);
  const dismiss = useSimStore((s) => s.dismissPersistenceNotice);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => dismiss(), 8000);
    return () => window.clearTimeout(id);
  }, [notice, dismiss]);

  if (!notice) return null;

  const glyph =
    notice.kind === "quota"
      ? "🪣"
      : notice.kind === "future-version"
        ? "⏩"
        : notice.kind === "migration-failed"
          ? "🪜"
          : notice.kind === "save-error"
            ? "⚠️"
            : "❗";
  const title =
    notice.kind === "quota"
      ? "Storage full"
      : notice.kind === "future-version"
        ? "Save from a newer build"
        : notice.kind === "migration-failed"
          ? "Couldn't migrate save"
          : notice.kind === "save-error"
            ? "Autosave failed"
            : "Save was corrupt";

  return (
    <button
      className="achievement-toast persistence-toast"
      onClick={dismiss}
      aria-live="polite"
      aria-label={`${title}: ${notice.message}`}
    >
      <span className="toast-glyph" aria-hidden>{glyph}</span>
      <span className="toast-body">
        <span className="toast-title">{title}</span>
        <span className="toast-desc">{notice.message}</span>
      </span>
    </button>
  );
}
