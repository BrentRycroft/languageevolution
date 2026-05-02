import { describe, it, expect } from "vitest";
import { Z } from "../zIndex";

describe("Z — z-index scale", () => {
  it("ascends overlay → banner → dropdown → modal → modalElevated → toast", () => {
    expect(Z.overlay).toBeLessThan(Z.banner);
    expect(Z.banner).toBeLessThan(Z.dropdown);
    expect(Z.dropdown).toBeLessThan(Z.modal);
    expect(Z.modal).toBeLessThan(Z.modalElevated);
    expect(Z.modalElevated).toBeLessThan(Z.toast);
  });

  it("matches the values declared in tokens.css", () => {
    // These exact numerics must stay in lockstep with tokens.css.
    // If you bump tokens.css, bump here too.
    expect(Z.overlay).toBe(5);
    expect(Z.banner).toBe(10);
    expect(Z.dropdown).toBe(50);
    expect(Z.modal).toBe(100);
    expect(Z.modalElevated).toBe(200);
    expect(Z.toast).toBe(1000);
  });
});
