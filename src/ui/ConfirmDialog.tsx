import { useEffect, useRef } from "react";
import { useSimStore } from "../state/store";

/**
 * Global confirm dialog. Replaces `window.confirm()` calls so the
 * UI matches the rest of the app's styling and isn't blocked by a
 * native browser dialog (which can't be styled, can't carry an
 * icon, and freezes the React render loop while open).
 *
 * Usage from any component:
 *
 *   const showConfirm = useSimStore((s) => s.showConfirm);
 *   onClick={async () => {
 *     if (!(await showConfirm({
 *       title: "Reset?",
 *       message: "This will discard unsaved progress.",
 *       confirmLabel: "Reset",
 *       danger: true,
 *     }))) return;
 *     reset();
 *   }}
 *
 * The dialog is mounted once near the top of `App` so a single
 * instance handles every confirm; the request state lives on the
 * store keyed by a Promise resolver.
 */
export function ConfirmDialog() {
  const request = useSimStore((s) => s.confirmDialog);
  const resolve = useSimStore((s) => s.resolveConfirm);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the confirm button so a keyboard user can hit Enter
  // immediately. Escape cancels.
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
