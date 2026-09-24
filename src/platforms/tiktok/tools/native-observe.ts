import { chromium, type Page, type Response, type Request } from "playwright";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { openStore } from "../../../core/runtime.ts";
import { errorRecord } from "../../../core/diagnostics.ts";
import {
  RoxyConnector,
  type RoxyConfig,
} from "../research/roxy.ts";

// Passive research recorder. It never sends platform requests or publishes
// templates. Browser interactions occur separately against observed page UI.
const store = openStore();
const account = store
  .listAccounts()
  .find((a) => a.id === process.argv[2] || a.label === process.argv[2]);
if (!account) throw new Error("Provide an existing Spider account ID or label");
const runId = randomUUID();
const pending = new Set<Promise<void>>();
const catalogue = new Map<string, any>();
const requestContexts = new WeakMap<
  Request,
  { action: string; pageId: string; pageUrl: string; requestId: string }
>();
const record = (stage: string, outcome: string, data: unknown) =>
  store.diagnostics.event(
    { requestId: runId, accountId: account.id },
    `tiktok-native-${stage}`,
    outcome,
    data,
  );
const isTarget = (value: string) => {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      (u.hostname === "tiktok.com" || u.hostname.endsWith(".tiktok.com")) &&
      /^\/(api|webcast|aweme)\//.test(u.pathname) &&
      !/\/(inbox|notice|feedback|message|im|passport|mention|at|privacy|compliance|passport)\//.test(
        u.pathname,
      ) &&
      !u.pathname.includes("/following/request/")
    );
  } catch {
    return false;
  }
};
const task = (promise: Promise<void>) => {
  const safe = promise.catch((error) => {
    record("capture", "failed", errorRecord(error));
  });
  pending.add(safe);
  void safe.then(() => pending.delete(safe));
};
let action = "initial-observation";
let stopping = false;
const flush = () => {
  mkdirSync("artifacts/tiktok-native", { recursive: true });
  writeFileSync(
    `artifacts/tiktok-native/${runId}.json`,
    JSON.stringify(
      {
        runId,
        accountId: account.id,
        updatedAt: new Date().toISOString(),
        independentVerified: false,
        endpoints: [...catalogue.values()],
      },
      null,
      2,
    ),
  );
};
async function capture(response: Response, pageId: string) {
  const request = response.request();
  if (
    !isTarget(response.url()) ||
    !["xhr", "fetch"].includes(request.resourceType())
  )
    return;
  const u = new URL(response.url());
  const requestContext = requestContexts.get(request) ?? {
    action,
    pageId,
    pageUrl: "unknown",
    requestId: randomUUID(),
  };
  const observedAction = requestContext.action;
  const headersId = record("headers", "received", {
    ...requestContext,
    action: observedAction,
    pageId,
    url: response.url(),
    status: response.status(),
    headers: await response.headersArray(),
    timing: request.timing(),
  });
  const key = `${request.method()} ${u.origin}${u.pathname}`;
  const entry = catalogue.get(key) ?? {
    method: request.method(),
    origin: u.origin,
    path: u.pathname,
    captures: 0,
    statuses: [],
    queryKeys: [],
    responseKeys: [],
    listFields: [],
    samples: [],
    captureFailures: 0,
  };
  catalogue.set(key, entry);
  entry.statuses = [...new Set([...entry.statuses, response.status()])];
  entry.queryKeys = [
    ...new Set([...entry.queryKeys, ...u.searchParams.keys()]),
  ];
  try {
    const bytes = await response.body();
    const body = bytes.toString("utf8");
    const omitted = bytes.length > 8 * 1024 * 1024;
    const payload = {
      ...requestContext,
      action: observedAction,
      pageId,
      url: response.url(),
      method: request.method(),
      headers: await request.allHeaders(),
      requestBody: request.postData(),
      responseHeaders: await response.allHeaders(),
      status: response.status(),
      body: omitted ? undefined : body,
      bodyOmitted: omitted,
      bodyBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      headersId,
    };
    const evidenceId = record(
      "http",
      omitted ? "body-too-large" : "received",
      payload,
    );
    entry.captures++;
    let businessStatus: unknown;
    try {
      const json = JSON.parse(body);
      if (json && typeof json === "object" && !Array.isArray(json)) {
        businessStatus = json.status_code ?? json.statusCode ?? json.code;
        entry.responseKeys = [
          ...new Set([...entry.responseKeys, ...Object.keys(json)]),
        ];
        entry.listFields = [
          ...new Set([
            ...entry.listFields,
            ...Object.entries(json)
              .filter(([, v]) => Array.isArray(v))
              .map(([k]) => k),
          ]),
        ];
      }
    } catch {
      /* Non-JSON raw body is retained; no business-success claim. */
    }
    entry.samples.push({
      evidenceId,
      action: observedAction,
      status: response.status(),
      businessStatus,
      bytes: bytes.length,
      bodyOmitted: omitted,
    });
    console.log(
      JSON.stringify({
        event: "response",
        path: u.pathname,
        method: request.method(),
        status: response.status(),
        businessStatus,
        evidenceId,
      }),
    );
  } catch (error) {
    entry.captureFailures++;
    record("http", "capture-failed", {
      ...requestContext,
      action: observedAction,
      pageId,
      url: response.url(),
      headersId,
      error: errorRecord(error),
    });
  }
  flush();
}
function attach(page: Page) {
  const pageId = randomUUID();
  page.on("request", (request) => {
    if (
      !isTarget(request.url()) ||
      !["xhr", "fetch"].includes(request.resourceType())
    )
      return;
    const observedAction = action;
    const requestContext = {
      action: observedAction,
      pageId,
      pageUrl: page.url(),
      requestId: randomUUID(),
    };
    requestContexts.set(request, requestContext);
    task(
      (async () => {
        record("request", "started", {
          ...requestContext,
          action: observedAction,
          pageId,
          method: request.method(),
          url: request.url(),
          headers: await request.allHeaders(),
          body: request.postData(),
          timing: request.timing(),
        });
      })(),
    );
  });
  page.on("response", (response) => task(capture(response, pageId)));
  page.on("requestfailed", (request) => {
    if (isTarget(request.url()))
      record("request", "failed", {
        pageId,
        action,
        ...requestContexts.get(request),
        url: request.url(),
        failure: request.failure(),
      });
  });
  page.on("pageerror", (error) => {
    const u = new URL(page.url());
    if (u.hostname === "tiktok.com" || u.hostname.endsWith(".tiktok.com"))
      record("page", "error", {
        pageId,
        pageUrl: page.url(),
        action,
        error: errorRecord(error),
      });
  });
}
const connector = new RoxyConnector(store.getSetting<RoxyConfig>("roxy")!);
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let resolveStop: (() => void) | undefined;
const stop = () => {
  stopping = true;
  resolveStop?.();
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);
try {
  browser = await chromium.connectOverCDP(
    await connector.endpoint(account.profileId),
  );
  browser.once("disconnected", stop);
  for (const context of browser.contexts()) {
    context.pages().forEach(attach);
    context.on("page", attach);
  }
  const metadata = {
    runId,
    accountId: account.id,
    pid: process.pid,
    profileId: account.profileId,
    startedAt: Date.now(),
  };
  writeFileSync(".spider/tiktok-native-active.json", JSON.stringify(metadata), {
    mode: 0o600,
  });
  record("observer", "started", metadata);
  console.log(JSON.stringify({ event: "ready", ...metadata }));
  // stdin accepts labels only; no arbitrary script or network target execution.
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    const label = String(chunk).trim();
    if (label === "stop") stop();
    else if (/^[a-z0-9._-]{1,100}$/i.test(label)) {
      action = label;
      record("action", "labelled", { action });
    }
  });
  if (!stopping)
    await new Promise<void>((resolve) => {
      resolveStop = resolve;
    });
} catch (error) {
  record("observer", "failed", { error: errorRecord(error) });
  process.exitCode = 1;
} finally {
  await browser?.close(); // Detach from the existing profile; never closes Roxy profile.
  await Promise.allSettled([...pending]);
  flush();
  record("observer", "closed", { endpoints: catalogue.size });
  const activePath = ".spider/tiktok-native-active.json";
  if (existsSync(activePath)) {
    const active = JSON.parse(readFileSync(activePath, "utf8"));
    if (active.runId === runId)
      writeFileSync(
        activePath,
        JSON.stringify({ ...active, status: "closed", endedAt: Date.now() }),
        { mode: 0o600 },
      );
  }
  store.close();
  process.stdin.pause();
}
