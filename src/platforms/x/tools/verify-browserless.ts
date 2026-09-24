import {
  operations,
  buildRequest,
  validateResult,
  type XOperation,
  type Capture,
} from "../native.ts";
// Research harness only: closes the supplied profile, runs a separate native
// executor, verifies it stayed closed, then restores the original open state.
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { openStore } from "../../../core/runtime.ts";
import { errorRecord } from "../../../core/diagnostics.ts";
import { profileConnection } from "../research/connection.ts";
const [profileId, ...args] = process.argv.slice(2),
  store = openStore(),
  requestId = randomUUID();
let config: Awaited<ReturnType<typeof profileConnection>>["config"] | undefined,
  closeRequested = false;
const report: any = {
  requestId,
  profileId,
  status: "running",
  startedAt: new Date().toISOString(),
};
async function call(path: string, body?: unknown) {
  const u = new URL(path, config!.host);
  if (!body) {
    u.searchParams.set("workspaceId", config!.workspaceId);
    u.searchParams.set("dirIds", profileId);
  }
  const r = await fetch(u, {
    method: body ? "POST" : "GET",
    headers: {
      ...(config!.apiKey ? { apikey: config!.apiKey } : {}),
      "content-type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
    redirect: "error",
  });
  const j = (await r.json()) as any;
  if (!r.ok || j.code !== 0) throw Error(`Roxy ${path} failed`);
  return j;
}
async function closed() {
  const j = await call("/browser/connection_info");
  if (!Array.isArray(j.data)) throw Error("Connection info is not a list");
  return !j.data.some((r: any) => r.dirId === profileId && r.ws);
}
try {
  if (!Object.hasOwn(operations, args[0] ?? ""))
    throw Error("Unknown operation");
  const meta = store.sql
    .prepare("SELECT stage,outcome FROM diagnostic_events WHERE id=?")
    .get(args[1]) as any;
  if (meta?.stage !== "x-http" || meta.outcome !== "received")
    throw Error("Invalid capture evidence");
  const capture = store.diagnostics.rawEvent(args[1]) as Capture;
  if (capture.profileId !== profileId) throw Error("Capture profile mismatch");
  const request = buildRequest(args[0] as XOperation, capture, {});
  validateResult(
    args[0] as XOperation,
    request.variables,
    capture.status,
    capture.body,
  );
  ({ config } = await profileConnection(store, profileId));
  closeRequested = true;
  await call("/browser/close", { dirId: profileId });
  let confirmed = false;
  for (let i = 0; i < 10; i++) {
    if (await closed()) {
      confirmed = true;
      break;
    }
    await delay(500);
  }
  if (!confirmed) throw Error("Profile still open");
  report.closedBefore = true;
  report.closedEvidenceId = store.diagnostics.event(
    { requestId },
    "x-browserless",
    "closed-before",
    { profileId },
  );
  const output = await new Promise<{ code: number | null; stdout: string }>(
    (resolve, reject) => {
      const p = spawn(
        process.execPath,
        [
          "--import",
          "tsx",
          new URL("./native-run.ts", import.meta.url).pathname,
          profileId,
          ...args,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 360000,
          killSignal: "SIGKILL",
        },
      );
      let stdout = "",
        stderr = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.stderr.on("data", (d) => (stderr += d));
      p.once("error", reject);
      p.once("close", (code) => {
        store.diagnostics.event(
          { requestId },
          "x-browserless",
          "child-exited",
          { code, stdout, stderr },
        );
        resolve({ code, stdout });
      });
    },
  );
  const native = JSON.parse(output.stdout.trim());
  report.nativeRequestId = native.requestId;
  report.nativeFailureEvidenceId = native.failureEvidenceId;
  report.nativeCode = native.code;
  report.closedAfter = await closed();
  if (!report.closedAfter || output.code !== 0 || native.status !== "succeeded")
    throw Error("Browserless acceptance failed");
  report.status = "succeeded";
} catch (error) {
  report.status = "failed";
  report.failureEvidenceId = store.diagnostics.event(
    { requestId },
    "x-browserless",
    "failed",
    { error: errorRecord(error) },
  );
  process.exitCode = 1;
} finally {
  if (closeRequested) {
    try {
      const j = await call("/browser/open", {
        workspaceId: Number(config!.workspaceId),
        dirId: profileId,
      });
      report.restored = !!j.data?.ws;
      if (!report.restored) throw Error("Reopen returned no endpoint");
    } catch (error) {
      report.restored = false;
      report.restoreEvidenceId = store.diagnostics.event(
        { requestId },
        "x-browserless",
        "restore-failed",
        { error: errorRecord(error) },
      );
      process.exitCode = 1;
    }
  }
  report.finishedAt = new Date().toISOString();
  mkdirSync("artifacts/x", { recursive: true });
  writeFileSync(
    `artifacts/x/browserless-${requestId}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report));
  store.close();
}
