import { useRegisterSW } from "virtual:pwa-register/react";
import { Z } from "./zIndex";

export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(
        () => {
          registration.update().catch(() => {});
        },
        60 * 60 * 1000,
      );
    },
  });

  if (!needRefresh) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: 16,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: Z.toast,
        display: "flex",
        gap: 10,
        alignItems: "center",
        background: "var(--panel)",
        color: "var(--text)",
        border: "1px solid var(--accent)",
        borderRadius: "var(--r-pill)",
        padding: "8px 14px",
        fontSize: "var(--fs-1)",
        boxShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
      }}
    >
      <span>A new version is available.</span>
      <button
        className="primary"
        onClick={() => updateServiceWorker(true)}
        style={{ padding: "4px 10px" }}
      >
        Reload
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        aria-label="dismiss"
        style={{
          background: "transparent",
          color: "var(--muted)",
          border: "none",
          cursor: "pointer",
        }}
      >
        ×
      </button>
    </div>
  );
}
