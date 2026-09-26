import { chromium, type Request, type Page } from "playwright";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { openStore } from "@datalom/storage-node/runtime";
import { errorRecord } from "@datalom/runtime-node/diagnostics";
import { profileConnection } from "../src/connection.ts";
const store = openStore(),
  profileId = process.argv[2],
  runId = randomUUID();
let action = "public-reel",
  stopped = false;
const entries: any[] = [],
  pending = new Set<Promise<void>>();
const contexts = new WeakMap<Request, any>();
const record = (stage: string, outcome: string, data: unknown) =>
  store.diagnostics.event({ requestId: runId }, `instagram-${stage}`, outcome, {
    profileId,
    ...(data as object),
  });
const flush = () => {
  mkdirSync("artifacts/instagram", { recursive: true });
  writeFileSync(
    `artifacts/instagram/capture-${runId}.json`,
    JSON.stringify(
      {
        runId,
        profileId,
        updatedAt: new Date().toISOString(),
        independentVerified: false,
        entries,
      },
      null,
      2,
    ),
  );
};
const task = (p: Promise<void>) => {
  const safe = p.catch((e) => {
    record("capture", "failed", { error: errorRecord(e) });
  });
  pending.add(safe);
  void safe.then(() => pending.delete(safe));
};
function select(request: Request) {
  const u = new URL(request.url());
  if (u.origin !== "https://www.instagram.com") return;
  const form = new URLSearchParams(request.postData() ?? "");
  const name =
    form.get("fb_api_req_friendly_name") ??
    request.headers()["x-fb-friendly-name"] ??
    "";
  if (
    /Mutation|Inbox|Direct|Notification|Badge|Presence|RecentSearch|Settings|Account|Login|Viewer|Suggested|QuickPromotion|NoteBubble/i.test(
      name,
    )
  )
    return;
  if (
    request.method() === "POST" &&
    /^\/(?:api\/)?graphql(?:\/query)?\/?$/.test(u.pathname) &&
    /Query$/.test(name)
  )
    return {
      name,
      docId: form.get("doc_id"),
      variables: form.get("variables"),
      formKeys: [...form.keys()],
    };
  if (
    request.method() === "GET" &&
    /^\/api\/v1\/(?:media\/\d+\/(?:info|comments|child_comments)\/|users\/web_profile_info\/|web\/search\/topsearch\/)/.test(
      u.pathname,
    )
  )
    return { name: u.pathname, docId: null, variables: null, formKeys: [] };
}
function attach(page: Page) {
  const pageId = randomUUID();
  page.on("request", (request) => {
    if (
      !page.url().startsWith("https://www.instagram.com/") ||
      page.url().includes("/direct/")
    )
      return;
    const selected = select(request);
    if (!selected) return;
    const meta = {
      ...selected,
      pageId,
      pageUrl: page.url(),
      action,
      captureId: randomUUID(),
    };
    contexts.set(request, meta);
    task(
      (async () => {
        record("request", "started", {
          ...meta,
          url: request.url(),
          method: request.method(),
          headers: await request.allHeaders(),
          body: request.postData(),
        });
      })(),
    );
  });
  page.on("response", (response) => {
    const request = response.request(),
      meta = contexts.get(request);
    if (!meta) return;
    task(
      (async () => {
        const headersId = record("headers", "received", {
          ...meta,
          status: response.status(),
          headers: await response.allHeaders(),
        });
        try {
          const bytes = await response.body();
          const omitted = bytes.length > 12 * 1024 * 1024;
          const evidenceId = record(
            "http",
            omitted ? "body-too-large" : "received",
            {
              ...meta,
              url: response.url(),
              method: request.method(),
              requestBody: request.postData(),
              requestHeaders: await request.allHeaders(),
              responseHeaders: await response.allHeaders(),
              status: response.status(),
              body: omitted ? undefined : bytes.toString("utf8"),
              bytes: bytes.length,
              sha256: createHash("sha256").update(bytes).digest("hex"),
              headersId,
            },
          );
          let variableKeys: string[] = [];
          try {
            variableKeys = Object.keys(JSON.parse(meta.variables ?? "{}"));
          } catch {}
          const item = {
            name: meta.name,
            docId: meta.docId,
            action: meta.action,
            status: response.status(),
            bytes: bytes.length,
            evidenceId,
            variableKeys,
            bodyOmitted: omitted,
          };
          entries.push(item);
          flush();
          console.log(JSON.stringify(item));
        } catch (error) {
          record("http", "capture-failed", {
            ...meta,
            headersId,
            error: errorRecord(error),
          });
        }
      })(),
    );
  });
  page.on("requestfailed", (request) => {
    const meta = contexts.get(request);
    if (meta)
      record("request", "failed", { ...meta, failure: request.failure() });
  });
  page.on("pageerror", (error) =>
    record("page", "error", {
      pageId,
      action,
      pageUrl: page.url(),
      error: errorRecord(error),
    }),
  );
}
let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | undefined;
let finish: (() => void) | undefined;
const stop = () => {
  stopped = true;
  finish?.();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const { endpoint } = await profileConnection(store, profileId);
  browser = await chromium.connectOverCDP(endpoint);
  browser.once("disconnected", stop);
  for (const ctx of browser.contexts()) {
    ctx
      .pages()
      .filter((p) => /instagram.com\/(?:reels|reel|p)\//.test(p.url()))
      .forEach(attach);
  }
  record("observer", "started", { runId, browserVersion: browser.version() });
  console.log(JSON.stringify({ ready: true, runId, pid: process.pid }));
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    const label = String(chunk).trim();
    if (label === "stop") stop();
    else if (/^[a-z0-9._-]{1,80}$/.test(label)) {
      action = label;
      record("action", "labelled", { action });
    }
  });
  if (!stopped)
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
} catch (error) {
  record("observer", "failed", { error: errorRecord(error) });
  process.exitCode = 1;
} finally {
  await browser?.close();
  await Promise.allSettled([...pending]);
  flush();
  record("observer", "closed", { captures: entries.length });
  store.close();
  process.stdin.pause();
}
