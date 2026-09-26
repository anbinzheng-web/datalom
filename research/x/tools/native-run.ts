import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { openStore } from "@datalom/storage-node/runtime";
import { DatalomError } from "@datalom/runtime-node/contracts";
import { errorRecord, type Trace } from "@datalom/runtime-node/diagnostics";
import { startRoute } from "@datalom/network-node/route";
import { XSessions } from "@datalom/platform-x/session";
import {
  buildRequest,
  validateResult,
  operations,
  type XOperation,
  type Capture,
} from "@datalom/platform-x/native";
import { XTransport } from "@datalom/platform-x/transport";

const [
  profileId,
  operationInput,
  evidenceId,
  updatesInput = "{}",
  pagesInput = "1",
] = process.argv.slice(2);
const store = openStore(),
  sessions = new XSessions(store),
  requestId = randomUUID();
const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
process.once("SIGTERM", cancel);
const timeout = setTimeout(cancel, 300000);
let held: ReturnType<XSessions["acquire"]> | undefined;
let route: Awaited<ReturnType<typeof startRoute>> | undefined;
let pageNumber = 0;
const report: Record<string, any> = {
  requestId,
  profileId,
  operation: operationInput,
  sourceEvidenceId: evidenceId,
  startedAt: new Date().toISOString(),
  browserUsed: false,
  adapterVersion: "x-native-0.2.1",
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
  const operation = operationInput as XOperation;
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
    ![
      "profile.posts",
      "profile.replies",
      "profile.reposts",
      "profile.media",
      "post.conversation",
      "search.timeline",
      "profile.followers",
      "profile.following",
    ].includes(operation)
  )
    throw new DatalomError("INVALID_INPUT", "该操作尚未实现分页");
  const meta = store.sql
    .prepare("SELECT stage,outcome FROM diagnostic_events WHERE id=?")
    .get(evidenceId) as any;
  if (meta?.stage !== "x-http" || meta.outcome !== "received")
    throw new DatalomError("INVALID_INPUT", "需要成功保存的浏览器采集证据");
  const capture = store.diagnostics.rawEvent(evidenceId) as Capture;
  if (capture.profileId !== profileId)
    throw new DatalomError("INVALID_INPUT", "采集样本不属于当前账号");
  const continuationId = updates._continuationEvidenceId;
  if (continuationId !== undefined) {
    const metadata = store.sql
      .prepare(
        "SELECT stage,accountId,outcome FROM diagnostic_events WHERE id=?",
      )
      .get(continuationId) as any;
    if (
      metadata?.stage !== "x-result" ||
      metadata.outcome !== "validated" ||
      metadata.accountId !== profileId
    )
      throw new DatalomError("INVALID_INPUT", "续页证据不属于当前账号结果");
    const previous = store.diagnostics.rawEvent(continuationId) as any;
    if (previous.operation !== operation)
      throw new DatalomError("INVALID_INPUT", "续页操作不匹配");
    for (const key of [
      "userId",
      "rawQuery",
      "product",
      "focalTweetId",
      "rankingMode",
    ])
      if (
        Object.hasOwn(updates, key) &&
        updates[key] !== previous.variables[key]
      )
        throw new DatalomError("INVALID_INPUT", "续页不能更换业务目标");
    const index = updates._moduleIndex;
    const cursor =
      index === undefined
        ? previous.page?.cursor
        : Number.isInteger(index) && index >= 0
          ? previous.page?.moduleCursors?.[index]?.cursor
          : undefined;
    if (typeof cursor !== "string" || !cursor)
      throw new DatalomError("INVALID_INPUT", "指定结果无有效续页游标");
    for (const key of [
      "userId",
      "rawQuery",
      "product",
      "focalTweetId",
      "rankingMode",
    ])
      if (previous.variables[key] !== undefined)
        updates[key] = previous.variables[key];
    updates.cursor = cursor;
    delete updates._continuationEvidenceId;
    delete updates._moduleIndex;
  }
  const sample = buildRequest(operation, capture, {}, 1);
  validateResult(operation, sample.variables, capture.status, capture.body);
  held = sessions.acquire(profileId);
  if (!held.session.route?.verifiedAt)
    throw new DatalomError("PROXY_UNAVAILABLE", "账号线路尚未验证");
  trace("x-session", "acquired", {
    profileId,
    capturedAt: held.session.capturedAt,
    sourceEvidenceId: evidenceId,
    browserVersion: held.session.observed.browserVersion,
    transportPreset: "chrome151",
    session: held.session,
  });
  route = await startRoute(held.session.route, store.dir, trace);
  const transport = new XTransport(route.url, held.session, trace);
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
    const selfId = decodeURIComponent(
      held.session.cookies.find((c) => c.name === "twid")?.value ?? "",
    )
      .replace(/^u=/, "")
      .replaceAll('"', "");
    if (
      request.variables.userId === selfId ||
      (held.session.observed.selfScreenName &&
        String(request.variables.screen_name ?? "").toLowerCase() ===
          String(held.session.observed.selfScreenName).toLowerCase())
    )
      throw new DatalomError("INVALID_INPUT", "不采集本账号资料");
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
    const owned = (item: any): boolean =>
      item.kind === "user"
        ? item.id === selfId
        : item.kind === "tweet"
          ? item.author?.id === selfId ||
            (!!item.quote && owned(item.quote)) ||
            (!!item.repost && owned(item.repost))
          : false;
    if (
      (operation === "profile.detail" || operation === "post.detail") &&
      result.raw.items.some(owned)
    )
      throw new DatalomError("INVALID_INPUT", "结果属于本账号，已停止");
    const publicItems = result.raw.items.filter((item) => !owned(item));
    const excludedSelf = result.raw.items.length - publicItems.length;
    result.raw.items = publicItems;
    if (result.page) result.page.items = publicItems;
    let duplicates = result.page?.duplicates ?? 0;
    for (const item of result.page?.items ??
      (Array.isArray(result.raw.items) ? result.raw.items : [])) {
      const itemKey = item.kind + ":" + item.id;
      if (ids.has(itemKey)) duplicates++;
      ids.add(itemKey);
    }
    const resultEvidenceId = store.diagnostics.event(
      {
        requestId,
        accountId: profileId,
        sessionVersion: held.version,
        page: pageNumber,
      },
      "x-result",
      "validated",
      {
        operation,
        variables: request.variables,
        raw: result.raw,
        page: result.page,
      },
    );
    report.pages.push({
      page: pageNumber,
      httpStatus: response.status,
      bytes: response.bytes,
      elapsedMs: Date.now() - started,
      chunks: result.chunks.length,
      moduleCursors: result.page?.moduleCursors.length,
      unavailable: result.page?.unavailable.length,
      excludedSelf,
      skipped: result.page?.skipped,
      count:
        result.page?.items.length ??
        (Array.isArray(result.raw.items) ? result.raw.items.length : undefined),
      duplicates,
      hasMore: result.page?.hasMore,
      evidenceId: resultEvidenceId,
    });
    if (!result.page?.hasMore || pageNumber === pages) break;
    const cursorKey = "cursor";
    if (
      result.page.cursor === request.variables[cursorKey] ||
      cursors.has(result.page.cursor!)
    )
      throw new DatalomError("SCHEMA_CHANGED", "分页游标重复，已停止");
    cursors.add(result.page.cursor!);
    updates[cursorKey] = result.page.cursor;
  }
  report.status = "succeeded";
  report.uniqueItems = ids.size;
  trace("x-run", "succeeded", report);
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
    "x-run",
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
        ["RATE_LIMIT", "CHALLENGE", "LOGIN_REQUIRED"].includes(report.code)
          ? 300000
          : 3000,
      );
    report.finishedAt = new Date().toISOString();
    mkdirSync("artifacts/x", { recursive: true });
    writeFileSync(
      `artifacts/x/independent-${requestId}.json`,
      JSON.stringify(report, null, 2),
    );
    console.log(JSON.stringify(report));
    store.close();
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}
