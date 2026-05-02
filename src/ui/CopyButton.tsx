import { useState, useCallback } from "react";

interface CopyButtonProps {
  /**
   * The text to copy. Can be a string or a thunk that produces the string
   * lazily (useful when copying expensive-to-compute output).
   */
  text: string | (() => string);
  /**
   * Optional title (tooltip). Defaults to "Copy to clipboard".
   */
  title?: string;
  /**
   * Optional aria-label. Defaults to title or "Copy to clipboard".
   */
  label?: string;
  /**
   * Optional className applied to the button. Defaults to "ghost icon-only".
   */
  className?: string;
  /**
   * Optional inline style.
   */
  style?: React.CSSProperties;
  /**
   * Optional content to render inside the button. Defaults to "📋" /
   * "✓" after a successful copy.
   */
  children?: React.ReactNode;
}

const COPIED_RESET_MS = 1100;

export function CopyButton({
  text,
  title = "Copy to clipboard",
  label,
  className = "ghost icon-only",
  style,
  children,
}: CopyButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  const onClick = useCallback(async () => {
    const value = typeof text === "function" ? text() : text;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setState("copied");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), COPIED_RESET_MS);
  }, [text]);

  const content = children ?? (state === "copied" ? "✓" : state === "error" ? "✗" : "📋");

  return (
    <button
      type="button"
      onClick={onClick}
      title={state === "copied" ? "Copied" : state === "error" ? "Copy failed" : title}
      aria-label={label ?? title}
      className={className}
      style={style}
    >
      {content}
    </button>
  );
}
