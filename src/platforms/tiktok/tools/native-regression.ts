import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { openStore } from "../../../core/runtime.ts";
import {
  nativeEndpoints,
  type NativeOperation,
} from "../native.ts";

// A local regression manifest containing capture IDs, never arbitrary URLs or scripts.
const cases = JSON.parse(readFileSync(process.argv[2], "utf8")) as {
  operation: NativeOperation;
  captureId: string;
  pages?: number;
}[];
const account = process.argv[3] ?? "TikTok1";
const store = openStore();
const results: any[] = [];
const runId = randomUUID();
try {
  for (const c of cases) {
    if (!Object.hasOwn(nativeEndpoints, c.operation))
      throw Error("Unknown operation");
    const capture: any = store.diagnostics.rawEvent(c.captureId);
    const url = new URL(capture.url);
    const fields = nativeEndpoints[c.operation].fields as readonly string[];
    const params = Object.fromEntries(
      [...url.searchParams].filter(([key]) => fields.includes(key)),
    );
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/platforms/tiktok/tools/native-run.ts",
        account,
        c.operation,
        c.captureId,
        JSON.stringify(params),
        String(c.pages ?? 1),
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (x) => {
      stdout += x;
    });
    child.stderr.on("data", (x) => {
      stderr += x;
    });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", resolve);
    });
    let result: any;
    try {
      result = JSON.parse(stdout);
    } catch {
      const evidenceId = store.diagnostics.event(
        { requestId: runId },
        "native-regression-child",
        "failed",
        { code, stdout, stderr },
      );
      result = { operation: c.operation, status: "failed", evidenceId, code };
    }
    results.push(result);
    writeFileSync(
      `artifacts/tiktok-native/regression-${runId}.json`,
      JSON.stringify({ runId, account, results }, null, 2),
    );
    console.log(
      JSON.stringify({
        operation: c.operation,
        status: result.status,
        requestId: result.requestId,
        pages: result.results?.length,
        counts: result.results?.map((r: any) => r.count),
        error: result.error,
      }),
    );
    // Fail closed on account challenges/rate limits; no account switching or retries.
    if (result.status !== "succeeded") {
      process.exitCode = 1;
      break;
    }
    await delay(3100);
  }
} finally {
  store.close();
}
