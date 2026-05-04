import type { SimulationConfig, SimulationState } from "../engine/types";

export interface SharePayload {
  v: 1 | 2;
  seed: string;
  config: SimulationConfig;
  biases?: Record<string, Record<string, number>>;
  replay?: number;
  /**
   * Phase 29 Tranche 8f: when present, the recipient restores this
   * SimulationState directly instead of replaying from gen 0.
   * Stripped of the form-key Map index (Tranche 1e) which can't
   * survive JSON; the receiver rebuilds it on restore. Bumps the
   * payload version to 2 so older receivers reject gracefully
   * instead of half-decoding.
   */
  stateSnapshot?: SimulationState;
}

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
    // Accept v1 (config-only) and v2 (config + optional snapshot).
    if (parsed.v !== 1 && parsed.v !== 2) return null;
    if (typeof parsed.seed !== "string") return null;
    if (!parsed.config || typeof parsed.config !== "object") return null;
    return parsed as SharePayload;
  } catch {
    return null;
  }
}

export function shareUrl(payload: SharePayload): string {
  const base =
    typeof location !== "undefined"
      ? `${location.origin}${location.pathname}`
      : "/";
  return `${base}?s=${encodeShare(payload)}`;
}

export function readShareFromLocation(): SharePayload | null {
  if (typeof location === "undefined") return null;
  const params = new URLSearchParams(location.search);
  const raw = params.get("s");
  if (!raw) return null;
  return decodeShare(raw);
}

export function clearShareFromLocation(): void {
  if (typeof location === "undefined" || typeof history === "undefined") return;
  const params = new URLSearchParams(location.search);
  if (!params.has("s")) return;
  params.delete("s");
  const next = `${location.pathname}${params.toString() ? "?" + params.toString() : ""}`;
  history.replaceState({}, "", next);
}
