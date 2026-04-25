import type { SimulationConfig } from "../engine/types";

/**
 * Compact URL-sharing payload. We encode only seed + config + the per-language
 * ruleBias overrides (applied post-load) — not the full simulation state, since
 * the procedural engine is deterministic from those inputs. This keeps the
 * share link short (typically < 2 KB after base64).
 */
export interface SharePayload {
  v: 1;
  seed: string;
  config: SimulationConfig;
  /** Optional per-language ruleBias overrides keyed by language id. */
  biases?: Record<string, Record<string, number>>;
  /** Generations to replay from the seed state. */
  replay?: number;
}

/**
 * Base64url encoding that's safe to put in a URL without further escaping.
 */
function toBase64Url(str: string): string {
  const utf8 = new TextEncoder().encode(str);
  let binary = "";
  for (const b of utf8) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): string {
  let b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4 !== 0) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeShare(payload: SharePayload): string {
  return toBase64Url(JSON.stringify(payload));
}

export function decodeShare(raw: string): SharePayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(raw));
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.v !== 1) return null;
    if (typeof parsed.seed !== "string") return null;
    if (!parsed.config || typeof parsed.config !== "object") return null;
    return parsed as SharePayload;
  } catch {
    return null;
  }
}

/**
 * Build a full share URL for the given config. Uses location.origin + pathname
 * so it works regardless of whether the app sits under /languageevolution/.
 */
export function shareUrl(payload: SharePayload): string {
  const base =
    typeof location !== "undefined"
      ? `${location.origin}${location.pathname}`
      : "/";
  return `${base}?s=${encodeShare(payload)}`;
}

/**
 * Read the ?s= share parameter from the current URL, decode it, and return
 * the payload. Returns null if absent or malformed. Safe to call at any
 * render phase.
 */
export function readShareFromLocation(): SharePayload | null {
  if (typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search);
  const raw = params.get("s");
  if (!raw) return null;
  return decodeShare(raw);
}

/**
 * Remove the share parameter from the current URL without reloading. Called
 * after a successful deep-link load so subsequent copies of the URL reflect
 * the user's live simulation instead of the original deep link.
 */
export function clearShareFromLocation(): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const params = new URLSearchParams(location.search);
  if (!params.has("s")) return;
  params.delete("s");
  const next = `${location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
  history.replaceState({}, "", next);
}
