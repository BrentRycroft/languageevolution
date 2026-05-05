// Phase 38+: in-memory IndexedDB for the persistence layer. The
// app's autosave + saved-runs storage now uses IDB (5MB localStorage
// quota was the source of recurring "Storage full" warnings on
// mature runs). Tests get a fresh in-memory IDB per file.
import "fake-indexeddb/auto";

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver = MockResizeObserver;

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
