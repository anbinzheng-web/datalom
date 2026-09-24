import { spawn } from "node:child_process";
import { openStore } from "../../../src/core/runtime.ts";
import { buildApp } from "./app.ts";
import { errorRecord } from "../../../src/core/diagnostics.ts";
const store = openStore();
const app = await buildApp(store, { logger: true });
await app.listen({ host: "127.0.0.1", port: 4317 });
store.diagnostics.event({}, "server", "started", {
  pid: process.pid,
  node: process.version,
});
const worker = spawn(
  process.execPath,
  ["--import", "tsx", "apps/worker/src/main.ts"],
  { stdio: "inherit", env: process.env },
);
console.log("Spider: http://127.0.0.1:4317 · 使用 pnpm auth 读取本机访问令牌");
worker.on("exit", (code, signal) => {
  if (!closing)
    store.diagnostics.event({}, "worker-process", "exited", {
      pid: worker.pid,
      code,
      signal,
    });
  if (code)
    app.log.error({ code }, "Worker exited; restart Spider to recover queue");
});
worker.on("error", (error) =>
  store.diagnostics.event({}, "worker-process", "failed", {
    error: errorRecord(error),
  }),
);
let closing = false;
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    if (closing) return;
    closing = true;
    worker.kill("SIGTERM");
    await app.close();
    store.close();
  });
