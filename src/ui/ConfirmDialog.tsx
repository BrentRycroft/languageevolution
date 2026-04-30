import { useEffect, useRef } from "react";
import { useSimStore } from "../state/store";

export function ConfirmDialog() {
  const request = useSimStore((s) => s.confirmDialog);
  const resolve = useSimStore((s) => s.resolveConfirm);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!request) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        resolve(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [request, resolve]);

  if (!request) return null;
  return (
    <div
      className="confirm-backdrop"
      onClick={() => resolve(false)}
      role="presentation"
    >
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-title" style={{ margin: "0 0 8px" }}>
          {request.title}
        </h3>
        <p id="confirm-message" style={{ margin: "0 0 16px", color: "var(--muted)" }}>
          {request.message}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ghost" onClick={() => resolve(false)}>
            {request.cancelLabel ?? "Cancel"}
          </button>
          <button
            ref={confirmRef}
            className={request.danger ? "danger" : "primary"}
            onClick={() => resolve(true)}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
