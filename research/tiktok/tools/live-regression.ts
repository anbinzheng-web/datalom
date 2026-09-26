import { fileURLToPath } from "node:url";
import { sourceMode, nodeLoaderArgs } from "@datalom/runtime-node/paths";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { openStore } from "@datalom/storage-node/runtime";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../src/roxy.ts";
const store = openStore(),
  config = store.getSetting<RoxyConfig>("roxy")!,
  connector = new RoxyConnector(config);
const selected = store
  .listAccounts()
  .filter((a) => ["TikTok1", "TikTok10"].includes(a.label));
if (selected.length !== 2)
  throw new Error("Expected two prepared validation accounts");
const closeProfiles = process.argv.includes("--close-profiles"),
  closed: string[] = [];
let worker: ReturnType<typeof spawn> | undefined;
const report: any = {
  date: new Date().toISOString(),
  browserProfilesClosed: false,
  workerBrowserImports: false,
  results: [],
  reopened: [],
};
async function mutation(path: string, dirId: string) {
  const r = await fetch(new URL(path, config.host), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.apiKey ? { apikey: config.apiKey } : {}),
    },
    body: JSON.stringify({ workspaceId: config.workspaceId, dirId }),
    signal: AbortSignal.timeout(45000),
  });
  const j = (await r.json()) as any;
  if (j.code !== 0) throw new Error(`Roxy ${path} failed (${j.code})`);
}
try {
  if (closeProfiles) {
    for (const a of selected) {
      await connector.endpoint(a.profileId);
      await mutation("/browser/close", a.profileId);
      closed.push(a.profileId);
    }
    await new Promise((r) => setTimeout(r, 1500));
    for (const a of selected) {
      let stillOpen = false;
      try {
        await connector.endpoint(a.profileId);
        stillOpen = true;
      } catch {}
      if (stillOpen) throw new Error("Profile still open");
    }
    report.browserProfilesClosed = true;
    console.log("Both test profiles closed; starting isolated HTTP Worker");
  }
  const jobs = selected.flatMap((a) =>
    ["video.detail", "video.comments"].map((operation) =>
      store.enqueue({
        accountId: a.id,
        operation: operation as any,
        video:
          "https://www.tiktok.com/@prettypickedd/video/7669255703952985375",
        maxPages: 3,
      }),
    ),
  );
  worker = spawn(
    process.execPath,
    [...nodeLoaderArgs(), fileURLToPath(import.meta.resolve("@datalom/worker/main"))],
    {
      stdio: ["ignore", "ignore", "pipe"],
      env: {
        ...process.env,
        ROXY_API_KEY: "",
        ROXY_API_HOST: "http://127.0.0.1:1",
        ROXY_CDP_ENDPOINT: "",
      },
    },
  );
  worker.stderr?.resume();
  for (let n = 0; n < 120; n++) {
    await new Promise((r) => setTimeout(r, 500));
    if (
      jobs.every(
        (j) => !["queued", "running"].includes(store.task(j.id).status),
      )
    )
      break;
  }
  report.results = jobs.map((j) => {
    const t = store.task(j.id);
    return {
      taskId: t.id,
      account: store.getAccount(t.accountId).label,
      operation: t.input.operation,
      status: t.status,
      pages: t.pages,
      itemId: t.result?.data?.id,
      comments: Array.isArray(t.result?.data)
        ? t.result.data.length
        : undefined,
      cursor: t.result?.cursor,
      error: t.error,
    };
  });
  report.passed = report.results.every(
    (r: any) =>
      r.status === "succeeded" &&
      (r.operation === "video.detail"
        ? r.itemId === "7669255703952985375"
        : r.pages === 3 && r.comments > 0),
  );
  console.log(
    JSON.stringify({ passed: report.passed, results: report.results }, null, 2),
  );
} finally {
  if (worker) {
    worker.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      worker!.once("exit", () => resolve());
      setTimeout(resolve, 5000).unref();
    });
  }
  for (const id of closed) {
    try {
      await mutation("/browser/open", id);
      report.reopened.push(id);
    } catch {
      report.reopenFailed = true;
    }
  }
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(
    "artifacts/live-regression.json",
    JSON.stringify(report, null, 2),
  );
  store.close();
}
if (!report.passed || report.reopenFailed) process.exitCode = 1;
