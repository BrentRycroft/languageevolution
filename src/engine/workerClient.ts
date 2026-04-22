import type { SimulationConfig, SimulationState } from "./types";

/**
 * Lightweight client for the engine Worker. Spawns the worker, initialises
 * it with a config, and exposes an async `stepN` that returns the state
 * snapshot once the worker is done. Used by the store's fast-forward path
 * when `useWorker` is enabled in config, so long runs don't block the UI.
 *
 * Falls back gracefully: if Worker is unavailable (SSR / jsdom tests), the
 * factory returns null and the caller runs sync on the main thread.
 */
export interface EngineWorkerClient {
  stepN: (n: number) => Promise<SimulationState>;
  restore: (state: SimulationState) => Promise<void>;
  terminate: () => void;
}

export async function createEngineWorker(
  config: SimulationConfig,
): Promise<EngineWorkerClient | null> {
  if (typeof Worker === "undefined") return null;

  let worker: Worker;
  try {
    worker = new Worker(new URL("./worker.ts", import.meta.url), {
      type: "module",
    });
  } catch {
    return null;
  }

  // Correlate requests and responses by integer id.
  let nextId = 1;
  const pending = new Map<number, (msg: unknown) => void>();

  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data as { kind: string; reqId?: number };
    if (typeof msg.reqId === "number") {
      const resolve = pending.get(msg.reqId);
      if (resolve) {
        pending.delete(msg.reqId);
        resolve(msg);
      }
    }
  };

  await new Promise<void>((resolve) => {
    const handler = (e: MessageEvent) => {
      if ((e.data as { kind: string }).kind === "ready") {
        worker.removeEventListener("message", handler);
        resolve();
      }
    };
    worker.addEventListener("message", handler);
    worker.postMessage({ kind: "init", config });
  });

  const call = <T>(payload: Record<string, unknown>): Promise<T> => {
    const reqId = nextId++;
    return new Promise<T>((resolve) => {
      pending.set(reqId, (msg) => resolve(msg as T));
      worker.postMessage({ ...payload, reqId });
    });
  };

  return {
    stepN: async (n) => {
      const res = await call<{ state: SimulationState }>({ kind: "stepN", n });
      return res.state;
    },
    restore: async (state) => {
      await call<unknown>({ kind: "restore", state });
    },
    terminate: () => worker.terminate(),
  };
}
