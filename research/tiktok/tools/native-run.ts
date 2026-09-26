import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { openStore } from "@datalom/storage-node/runtime";
import {
  DatalomError,
  safeError,
  type RequestTemplate,
} from "@datalom/runtime-node/contracts";
import {
  errorRecord,
  assessment,
  type Trace,
} from "@datalom/runtime-node/diagnostics";
import {
  executeNative,
  validateNativeInput,
  parseNative,
  type NativeInput,
  type NativeOperation,
} from "@datalom/platform-tiktok/native";
import { openTransport } from "@datalom/worker/runner";

// Deliberately no browser connector. Requires explicit original-operation parameters.
// Usage: pnpm exec tsx --conditions=datalom-source research/tiktok/tools/native-run.ts ACCOUNT OP CAPTURE_ID '{"...":"..."}' [PAGES]
const store = openStore();
const requestId = randomUUID();
let lease: string | null = null;
let connection: Awaited<ReturnType<typeof openTransport>> | undefined;
let heartbeat: ReturnType<typeof setInterval> | undefined;
const controller = new AbortController();
const stop = () => controller.abort();
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
const timeout = setTimeout(() => controller.abort(), 180_000);
const report: any = {
  requestId,
  startedAt: new Date().toISOString(),
  browserUsed: false,
  results: [],
  status: "started",
};
const account = store
  .listAccounts()
  .find((a) => a.id === process.argv[2] || a.label === process.argv[2]);
const trace: Trace = (stage, outcome, payload, code) => {
  store.diagnostics.event(
    { requestId, accountId: account?.id, sessionVersion: account?.version },
    stage,
    outcome,
    payload,
    code,
  );
};
try {
  if (!account) throw new DatalomError("INVALID_INPUT", "指定已有账号");
  report.account = account.label;
  const operation = process.argv[3] as NativeOperation;
  const captureId = process.argv[4];
  const input: NativeInput = {
    operation,
    parameters: JSON.parse(process.argv[5] ?? "{}"),
  };
  const pages = Number(process.argv[6] ?? 1);
  if (
    !input.parameters ||
    Array.isArray(input.parameters) ||
    typeof input.parameters !== "object" ||
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 10
  )
    throw new DatalomError("INVALID_INPUT", "需要参数对象和 1–10 页");
  if (
    pages > 1 &&
    ![
      "comment.replies",
      "user.posts",
      "hashtag.posts",
      "music.posts",
      "user.playlists",
      "user.reposts",
      "playlist.posts",
    ].includes(operation)
  )
    throw new DatalomError(
      "RESEARCH_REQUIRED",
      "此接口的后续分页上下文尚未验证，先执行单页实验",
    );
  const row = store.sql
    .prepare(
      "SELECT accountId, stage, outcome, createdAt FROM diagnostic_events WHERE id=?",
    )
    .get(captureId) as any;
  if (
    !row ||
    row.accountId !== account.id ||
    row.stage !== "tiktok-native-http" ||
    row.outcome !== "received"
  )
    throw new DatalomError("INVALID_INPUT", "需要同一账号的完整原站响应证据");
  const capture = store.diagnostics.rawEvent(captureId) as any;
  if (
    capture.method !== "GET" ||
    capture.status !== 200 ||
    typeof capture.body !== "string"
  )
    throw new DatalomError("INVALID_INPUT", "需要成功 GET 样本");
  const template: RequestTemplate = {
    url: capture.url,
    headers: capture.headers,
    capturedAt: row.createdAt,
  };
  validateNativeInput(input, template);
  const capturedUrl = new URL(capture.url);
  const capturedInput = {
    operation,
    parameters: Object.fromEntries(capturedUrl.searchParams),
  };
  parseNative(capturedInput, capture.status, capture.body);
  report.operation = operation;
  report.captureId = captureId;
  lease = store.lease(account.id);
  if (!lease) throw new DatalomError("CONFLICT", "账号不可用、冷却中或已被占用");
  const session = store.getSecret(account.id);
  heartbeat = setInterval(() => {
    try {
      if (!store.renew(account.id, lease!)) controller.abort();
    } catch (error) {
      trace("native-lease", "failed", { error: errorRecord(error) });
      controller.abort();
    }
  }, 10_000);
  trace("native-session", "snapshot", {
    session,
    captureId,
    input,
    observedBrowserVersion: session.observed.browserVersion,
    transport: "impit/chrome151",
    browserUsed: false,
  });
  connection = await openTransport(session, store.dir, trace);
  const seenCursors = new Set<string>(),
    seenIds = new Set<string>();
  for (let page = 1; page <= pages; page++) {
    const cursor = input.parameters.cursor ?? "0";
    if (seenCursors.has(cursor))
      throw new DatalomError("SCHEMA_CHANGED", "分页游标循环");
    seenCursors.add(cursor);
    const wait = store.reserveRate(
      account.id,
      lease,
      `native.${operation}`,
      3000,
    );
    if (wait) await delay(wait, undefined, { signal: controller.signal });
    let result;
    try {
      result = await executeNative(input, template, {
        account,
        session,
        transport: connection.transport,
        signal: controller.signal,
        trace,
        saveSession: () => {
          connection!.save();
          store.saveSecret(account.id, account.version, session, lease!);
        },
        recordEvidence: (kind, summary, payload) => {
          const evidenceId = store.evidence(account.id, kind, summary, {
            requestId,
            payload,
          });
          trace("native-evidence", "saved", { evidenceId, kind });
        },
      });
    } finally {
      store.scheduleNext(account.id, lease, 3000);
    }
    const ids: string[] =
      operation === "comment.replies"
        ? result.raw.comments.map((c: any) => c.cid)
        : [];
    let duplicates = 0;
    for (const id of ids) {
      if (seenIds.has(id)) duplicates++;
      seenIds.add(id);
    }
    report.results.push({
      page,
      inputCursor: cursor,
      count: result.count,
      cursor: result.cursor,
      hasMore: result.hasMore,
      replyIds: ids.length ? ids : undefined,
      duplicates,
      uniqueReplies: seenIds.size || undefined,
      responseKeys: Object.keys(result.raw),
    });
    if (!result.hasMore || !result.cursor) break;
    input.parameters.cursor = result.cursor;
  }
  report.status = "succeeded";
  trace("native-run", "completed", report);
} catch (error) {
  report.status = "failed";
  report.error = safeError(error);
  report.diagnosis = assessment(report.error.code);
  trace(
    "native-run",
    "failed",
    { ...report, error: errorRecord(error) },
    report.error.code,
  );
  if (account && lease) {
    if (report.error.code === "RATE_LIMIT")
      store.status(account.id, "cooldown", report.error.message, 60000);
    if (["LOGIN_REQUIRED", "CHALLENGE"].includes(report.error.code))
      store.status(account.id, "login_required", report.error.message);
  }
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  clearTimeout(timeout);
  if (heartbeat) clearInterval(heartbeat);
  try {
    await connection?.close();
  } catch (error) {
    trace("native-cleanup", "failed", { error: errorRecord(error) });
    report.cleanupFailed = true;
    process.exitCode = 1;
  }
  if (account && lease) store.release(account.id, lease);
  report.finishedAt = new Date().toISOString();
  mkdirSync("artifacts/tiktok-native", { recursive: true });
  writeFileSync(
    `artifacts/tiktok-native/independent-${requestId}.json`,
    JSON.stringify(report, null, 2),
  );
  store.close();
  console.log(JSON.stringify(report, null, 2));
}
