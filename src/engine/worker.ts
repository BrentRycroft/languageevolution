

import { createSimulation, type Simulation } from "./simulation";
import type { SimulationConfig, SimulationState } from "./types";

type Request =
  | { kind: "init"; config: SimulationConfig }
  | { kind: "stepN"; n: number; reqId: number }
  | { kind: "restore"; state: SimulationState; reqId: number };

type Response =
  | { kind: "ready" }
  | { kind: "stepN.done"; reqId: number; state: SimulationState }
  | { kind: "restore.done"; reqId: number };

let sim: Simulation | null = null;

self.onmessage = (e: MessageEvent<Request>) => {
  const msg = e.data;
  switch (msg.kind) {
    case "init": {
      sim = createSimulation(msg.config);
      (self as unknown as Worker).postMessage({ kind: "ready" } as Response);
      break;
    }
    case "stepN": {
      if (!sim) return;
      for (let i = 0; i < msg.n; i++) sim.step();
      (self as unknown as Worker).postMessage({
        kind: "stepN.done",
        reqId: msg.reqId,
        state: sim.getState(),
      } as Response);
      break;
    }
    case "restore": {
      if (!sim) return;
      sim.restoreState(msg.state);
      (self as unknown as Worker).postMessage({
        kind: "restore.done",
        reqId: msg.reqId,
      } as Response);
      break;
    }
  }
};

export {};
