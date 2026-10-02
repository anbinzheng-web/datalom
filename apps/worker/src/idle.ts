import { randomUUID } from "node:crypto";
import type { Store } from "@datalom/shared/storage/store";

// Idle process skeleton. It records a heartbeat and does not claim or run tasks.
export function runIdle(store: Store) {
  const workerId = randomUUID();
  store.heartbeat(workerId);
  store.diagnostics.event({}, "worker", "started", {
    workerId,
    pid: process.pid,
    node: process.version,
  });
  const timer = setInterval(() => store.heartbeat(workerId), 5000);
  timer.unref?.();
  return {
    get healthy() {
      return true;
    },
    async stop(signal = "stop") {
      clearInterval(timer);
      store.diagnostics.event({}, "worker", "stopped", { workerId, signal });
      store.removeWorker(workerId);
    },
  };
}
