import { useEffect } from "react";
import { useSimStore } from "../state/store";
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID } from "../engine/achievements/catalog";

/**
 * Permanent trophy strip — one badge per catalog achievement. Unlocked
 * badges glow; locked ones stay muted with their descriptions visible
 * on hover so the user can see what's still to come.
 */
export function AchievementsStrip() {
  const unlocked = useSimStore((s) => s.unlockedAchievements);
  const set = new Set(unlocked);
  return (
    <div className="achievements-strip" role="list">
      {ACHIEVEMENTS.map((a) => {
        const done = set.has(a.id);
        return (
          <div
            key={a.id}
            role="listitem"
            className={`achievement ${done ? "done" : "locked"}`}
            title={`${a.label} — ${a.description}${done ? "" : " (locked)"}`}
          >
            <span className="glyph" aria-hidden>{a.icon}</span>
            <span className="label">{a.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Short toast that appears over the main content when a new achievement
 * fires. Auto-dismisses after ~4 s; click to dismiss sooner.
 */
export function AchievementToast() {
  const last = useSimStore((s) => s.lastAchievement);
  const dismiss = useSimStore((s) => s.dismissAchievementToast);

  useEffect(() => {
    if (!last) return;
    const id = window.setTimeout(() => dismiss(), 4000);
    return () => window.clearTimeout(id);
  }, [last, dismiss]);

  if (!last) return null;
  const a = ACHIEVEMENTS_BY_ID[last];
  if (!a) return null;

  return (
    <button
      className="achievement-toast"
      onClick={dismiss}
      aria-live="polite"
      aria-label={`Achievement unlocked: ${a.label}`}
    >
      <span className="toast-glyph" aria-hidden>{a.icon}</span>
      <span className="toast-body">
        <span className="toast-title">Achievement unlocked</span>
        <span className="toast-label">{a.label}</span>
        <span className="toast-desc">{a.description}</span>
      </span>
    </button>
  );
}
