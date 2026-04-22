import { describe, it, expect } from "vitest";
import { encodeShare, decodeShare, type SharePayload } from "../url";
import { defaultConfig } from "../../engine/config";

describe("share/url", () => {
  it("encode then decode round-trips a payload", () => {
    const payload: SharePayload = {
      v: 1,
      seed: "test-seed",
      config: defaultConfig(),
      replay: 42,
    };
    const encoded = encodeShare(payload);
    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeGreaterThan(10);
    const decoded = decodeShare(encoded);
    expect(decoded).not.toBeNull();
    if (!decoded) return;
    expect(decoded.seed).toBe("test-seed");
    expect(decoded.replay).toBe(42);
    expect(decoded.config.seed).toBe(payload.config.seed);
  });

  it("round-trips bias overrides", () => {
    const payload: SharePayload = {
      v: 1,
      seed: "bias",
      config: defaultConfig(),
      biases: { "L-0": { lenition: 1.5, harmony: 0.8 } },
    };
    const decoded = decodeShare(encodeShare(payload));
    if (!decoded) throw new Error("expected decode");
    expect(decoded.biases?.["L-0"]?.lenition).toBe(1.5);
    expect(decoded.biases?.["L-0"]?.harmony).toBe(0.8);
  });

  it("rejects malformed inputs gracefully", () => {
    expect(decodeShare("")).toBeNull();
    expect(decodeShare("not base64 ~!")).toBeNull();
    // Valid base64 but not a SharePayload.
    expect(decodeShare(btoa("null"))).toBeNull();
    expect(decodeShare(btoa('{"not":"share"}'))).toBeNull();
  });

  it("rejects an unknown schema version", () => {
    const bad = btoa(JSON.stringify({ v: 99, seed: "x", config: defaultConfig() }))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(decodeShare(bad)).toBeNull();
  });
});
