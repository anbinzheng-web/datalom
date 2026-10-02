import { artifactPath } from "@datalom/shared/runtime/paths";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { openStore } from "@datalom/shared/storage/runtime";
import { DatalomError } from "@datalom/shared/runtime/contracts";
import { errorRecord, type Trace } from "@datalom/shared/runtime/diagnostics";
import { startRoute } from "@datalom/network-node/route";
import { InstagramSessions } from "@datalom/platform-instagram/session";
import {
  buildRequest,
  validateResult,
  operations,
  type InstagramOperation,
  type Capture,
} from "@datalom/platform-instagram/native";
import { InstagramTransport } from "@datalom/platform-instagram/transport";

const [
  profileId,
  operationInput,
  evidenceId,
  updatesInput = "{}",
  pagesInput = "1",
] = process.argv.slice(2);
const store = openStore(),
  sessions = new InstagramSessions(store),
  requestId = randomUUID();
const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const timeout = setTimeout(cancel, 300000);
let held: ReturnType<InstagramSessions["acquire"]> | undefined;
let route: Awaited<ReturnType<typeof startRoute>> | undefined;
let pageNumber = 0;
const report: Record<string, any> = {
  requestId,
  profileId,
  operation: operationInput,
  sourceEvidenceId: evidenceId,
  startedAt: new Date().toISOString(),
  browserUsed: false,
  adapterVersion: "instagram-native-0.1.0",
  status: "running",
  pages: [],
};
const trace: Trace = (stage, outcome, payload, code) => {
  store.diagnostics.event(
    {
      requestId,
      accountId: profileId,
      sessionVersion: held?.version,
      page: pageNumber,
      attempt: 1,
    },
    stage,
    outcome,
    payload,
    code,
  );
};
try {
  if (
    !/^[a-f0-9]{32}$/.test(profileId ?? "") ||
    !Object.hasOwn(operations, operationInput ?? "")
  )
    throw new DatalomError(
      "INVALID_INPUT",
      "Usage: native-run <profileId> <operation> <captureEvidenceId> [updates JSON] [pages 1..3]",
    );
  const operation = operationInput as InstagramOperation;
  const pages = Number(pagesInput),
    updates = JSON.parse(updatesInput);
  if (
    !Number.isInteger(pages) ||
    pages < 1 ||
    pages > 3 ||
    !updates ||
    typeof updates !== "object" ||
    Array.isArray(updates)
  )
    throw new DatalomError("INVALID_INPUT", "实验仅允许 1–3 页及对象变量");
  if (
    pages > 1 &&
    !["post.comments", "comment.replies", "search.media.page"].includes(
      operation,
    )
  )
    throw new DatalomError("INVALID_INPUT", "该操作尚未实现分页");
  const meta = store.sql
    .prepare("SELECT stage,outcome FROM diagnostic_events WHERE id=?")
    .get(evidenceId) as any;
  if (meta?.stage !== "instagram-http" || meta.outcome !== "received")
    throw new DatalomError("INVALID_INPUT", "需要成功保存的浏览器采集证据");
  const capture = store.diagnostics.rawEvent(evidenceId) as Capture;
  if (capture.profileId !== profileId)
    throw new DatalomError("INVALID_INPUT", "采集样本不属于当前账号");
  const sample = buildRequest(operation, capture, {}, 1);
  validateResult(operation, sample.variables, capture.status, capture.body);
  held = sessions.acquire(profileId);
  const self = held.session.cookies.find((c) => c.name === "ds_user_id")?.value;
  if (
    self &&
    ["id", "userID", "user_id", "sellerId", "sellerID"].some(
      (key) => sample.variables[key] === self,
    ) &&
    /^(profile|page|marketplace\.(seller|inventory))/.test(operation)
  )
    throw new DatalomError("INVALID_INPUT", "不采集本账号资料");
  if (!held.session.route?.verifiedAt)
    throw new DatalomError("PROXY_UNAVAILABLE", "账号线路尚未验证");
  trace("instagram-session", "acquired", {
    profileId,
    capturedAt: held.session.capturedAt,
    sourceEvidenceId: evidenceId,
    browserVersion: held.session.observed.browserVersion,
    transportPreset: "chrome151",
    session: held.session,
  });
  route = await startRoute(held.session.route, store.dir, trace);
  const transport = new InstagramTransport(route.url, held.session, trace);
  const ids = new Set<string>(),
    cursors = new Set<string>();
  for (pageNumber = 1; pageNumber <= pages; pageNumber++) {
    if (pageNumber > 1)
      await delay(3000, undefined, { signal: controller.signal });
    controller.signal.throwIfAborted();
    if (!sessions.renew(profileId, held.lease))
      throw new DatalomError("CONFLICT", "会话租约已失效");
    const request = buildRequest(
      operation,
      capture,
      updates,
      ++held.session.requestCounter,
    );
    // Persist before I/O so a failed request never reuses its sequence number.
    sessions.save(held.session, held.version, held.lease);
    const started = Date.now();
    const response = await transport.request(
      request,
      AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
    );
    sessions.save(held.session, held.version, held.lease);
    const result = validateResult(
      operation,
      request.variables,
      response.status,
      response.body,
    );
    let duplicates = 0;
    for (const item of result.page?.items ??
      (Array.isArray(result.raw.items) ? result.raw.items : [])) {
      if (ids.has(item.id)) duplicates++;
      ids.add(item.id);
    }
    const resultEvidenceId = store.diagnostics.event(
      {
        requestId,
        accountId: profileId,
        sessionVersion: held.version,
        page: pageNumber,
      },
      "instagram-result",
      "validated",
      { operation, variables: request.variables, ...result },
    );
    report.pages.push({
      page: pageNumber,
      httpStatus: response.status,
      bytes: response.bytes,
      elapsedMs: Date.now() - started,
      chunks: result.chunks.length,
      count:
        result.page?.items.length ??
        (Array.isArray(result.raw.items) ? result.raw.items.length : undefined),
      duplicates,
      hasMore: result.page?.hasMore,
      evidenceId: resultEvidenceId,
    });
    if (!result.page?.hasMore || pageNumber === pages) break;
    const cursorKey = "after";
    if (
      result.page.cursor === request.variables[cursorKey] ||
      cursors.has(result.page.cursor!)
    )
      throw new DatalomError("SCHEMA_CHANGED", "分页游标重复，已停止");
    cursors.add(result.page.cursor!);
    updates[cursorKey] = result.page.cursor;
    updates.first = 10;
  }
  report.status = "succeeded";
  report.uniqueItems = ids.size;
  trace("instagram-run", "succeeded", report);
} catch (error) {
  report.status = "failed";
  report.code =
    error instanceof DatalomError
      ? error.code
      : controller.signal.aborted
        ? "CANCELLED"
        : "INTERNAL";
  report.failureEvidenceId = store.diagnostics.event(
    {
      requestId,
      accountId: profileId,
      sessionVersion: held?.version,
      page: pageNumber,
    },
    "instagram-run",
    "failed",
    {
      error: errorRecord(error),
      report,
      causeConfirmed: false,
      nextExperiment:
        "对照 sourceEvidenceId 的浏览器成功样本和本次 HTTP 原始响应；先确定失败阶段，再做单变量实验；不自动重试。",
    },
    report.code,
  );
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  try {
    await route?.stop();
  } finally {
    if (held)
      sessions.release(
        profileId,
        held.lease,
        report.code === "RATE_LIMIT" ? 300000 : 3000,
      );
    report.finishedAt = new Date().toISOString();
    mkdirSync(artifactPath("instagram"), { recursive: true });
    writeFileSync(
      artifactPath(`instagram/independent-${requestId}.json`),
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    store.close();
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
