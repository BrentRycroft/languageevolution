import { useSimStore } from "../state/store";

export function ActivityHeatmap() {
  const history = useSimStore((s) => s.activityHistory);
  if (history.length === 0) return null;
  const maxCount = Math.max(1, ...history.map((h) => h.count));
  const maxBirths = Math.max(1, ...history.map((h) => h.ruleBirths ?? 0));
  const last = history[history.length - 1];
  const latestBirths = last?.ruleBirths ?? 0;
  return (
    <div
      className="activity-heatmap-wrap"
      aria-label="Per-generation change activity"
      title={`Latest: ${last?.count ?? 0} form changes + ${latestBirths} new sound law${latestBirths === 1 ? "" : "s"} (peaks ${maxCount} / ${maxBirths})`}
    >
      <div className="activity-heatmap">
        {history.map((h) => {
          const intensity = h.count / maxCount;
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
      <div className="activity-heatmap rule-births">
        {history.map((h) => {
          const births = h.ruleBirths ?? 0;
          const intensity = births / maxBirths;
          return (
            <span
              key={h.generation}
              className="activity-bar"
              style={{
                height: `${4 + intensity * 10}px`,
                background:
                  births === 0
                    ? "var(--panel-3)"
                    : `hsla(0, 70%, ${45 + intensity * 30}%, ${0.5 + intensity * 0.5})`,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
