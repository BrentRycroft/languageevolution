import { useSimStore } from "../state/store";

/**
 * Slim strip of recent per-generation change counts. Placed above the Tree
 * view so the user can see the rhythm of the simulation at a glance —
 * burst windows (rapid-change periods) pulse; quiet generations are dark.
 */
export function ActivityHeatmap() {
  const history = useSimStore((s) => s.activityHistory);
  if (history.length === 0) return null;
  const max = Math.max(1, ...history.map((h) => h.count));
  return (
    <div
      className="activity-heatmap"
      aria-label="Per-generation change activity"
      title={`Latest: ${history[history.length - 1]?.count ?? 0} changes (peak ${max})`}
    >
      {history.map((h) => {
        const intensity = h.count / max;
        return (
          <span
            key={h.generation}
            className="activity-bar"
            style={{
              height: `${12 + intensity * 16}px`,
              background:
                intensity === 0
                  ? "var(--panel-3)"
                  : `hsla(var(--activity-hue, 200), 70%, ${40 + intensity * 35}%, ${0.4 + intensity * 0.6})`,
            }}
          />
        );
      })}
    </div>
  );
}
