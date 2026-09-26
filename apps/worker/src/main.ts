import { openStore } from "@datalom/storage-node/runtime";
import { Runner } from "./runner.ts";
import { randomUUID } from "node:crypto";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
const store = openStore();
const workerId = randomUUID();
store.heartbeat(workerId);
store.diagnostics.event({}, "worker", "started", {
  workerId,
  pid: process.pid,
  node: process.version,
});
const runner = new Runner(store);
const heartbeat = setInterval(() => {
  if (runner.healthy) store.heartbeat(workerId);
  else store.removeWorker(workerId);
}, 5000);
runner.start();
console.log("Datalom HTTP worker ready (no browser dependencies)");
let stopping = false;
const fatal = (error: unknown) => {
  try {
    store.diagnostics.emergency({
      stage: "worker-process-fatal",
      workerId,
      pid: process.pid,
      error: errorRecord(error),
    });
  } finally {
    process.exit(1);
  }
};
process.on("uncaughtException", fatal);
process.on("unhandledRejection", fatal);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    if (stopping) return;
    stopping = true;
    await runner.stop();
    store.diagnostics.event({}, "worker", "stopped", { workerId, signal });
    clearInterval(heartbeat);
    store.removeWorker(workerId);
    store.close();
    process.exit(0);
  });
