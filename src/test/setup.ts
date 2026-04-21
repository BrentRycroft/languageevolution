// Test environment setup for vitest + jsdom.
// ResizeObserver is used by LanguageTreeView but not provided by jsdom.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;

// Recharts uses getBoundingClientRect; jsdom returns zeroes which crashes
// layout. Patch to return reasonable defaults.
if (typeof window !== "undefined") {
  const originalGBCR = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (): DOMRect {
    const r = originalGBCR.call(this);
    if (r.width === 0 && r.height === 0) {
      return {
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 600,
        bottom: 400,
        width: 600,
        height: 400,
        toJSON: () => ({}),
      } as DOMRect;
    }
    return r;
  };
}
