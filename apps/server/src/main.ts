import { fileURLToPath } from "node:url";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, NestFastifyApplication } from "@nestjs/platform-fastify";
import { nodeLoaderArgs } from "@datalom/runtime-node/paths";
import { spawn } from "node:child_process";
import { openStore } from "@datalom/storage-node/runtime";
import { buildApp } from "./app.ts";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import { DatalomModule } from "./nest.module.ts";
const store = openStore();
const adapter = new FastifyAdapter({ logger: true });
const nest = await NestFactory.create<NestFastifyApplication>(DatalomModule, adapter);
const app = await buildApp(store, { logger: false }, adapter.getInstance());
await nest.listen(4317, "127.0.0.1");
store.diagnostics.event({}, "server", "started", {
  pid: process.pid,
  node: process.version,
  framework: "nestjs",
});
const worker = spawn(
  process.execPath,
  [
    ...nodeLoaderArgs(),
    fileURLToPath(import.meta.resolve("@datalom/worker/main")),
  ],
  { stdio: "inherit", env: process.env },
);
console.log("Datalom: http://127.0.0.1:4317 · NestJS API · 使用 pnpm auth 读取本机访问令牌");
worker.on("exit", (code, signal) => {
  if (!closing)
    store.diagnostics.event({}, "worker-process", "exited", {
      pid: worker.pid,
      code,
      signal,
    });
  if (code)
    app.log.error({ code }, "Worker exited; restart Datalom to recover queue");
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
    await nest.close();
    store.close();
  });
